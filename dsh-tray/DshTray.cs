// DshTray — DeepSeek Harness 系统托盘启动器
// 编译:build-tray.ps1(csc /target:winexe /win32icon:whale.ico)
// 兼容 C# 5 / .NET Framework 4.x(不用字符串插值等新语法)。
// 行为:
//  1. 启动时若 http://127.0.0.1:3080 已在响应 → 弹气泡 + 打开页面,不重复起 dsh;
//  2. 否则后台启动 dsh web(node bin.js --profile web --host 127.0.0.1 --port 3080),
//     窗口隐藏,stdout/stderr 追加到 dsh-tray.log;
//  3. 右下角托盘鲸鱼图标;左键双击打开页面;
//     右键菜单:显示页面 / 复制登录 URL / 重启 / 退出;
//  4. 「复制登录 URL」:DSH 0.1.2+ 的 Web GUI 需要浏览器会话认证,该 URL 里带一次性 token,
//     粘贴到 VS Code 扩展(DSH 面板)的登录框即可,会话 30 天有效。URL 捕获自子进程 stdout,
//     并落盘到 dsh-tray-login-url.txt;日志里的 token 一律打码(token 可能随日志被贴出去)。
//     复制前会先验证 token 属于「当前正在运行的」dsh(有效 token 兑换返回 303;旧版无鉴权服务返回 200),
//     避免复制到上一个实例遗留的失效 URL;
//  5. 退出:taskkill /T 结束自己启动的 dsh 进程树,再退出托盘。
using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Windows.Forms;

public class DshTrayApp
{
    static NotifyIcon tray;
    static Process child;
    static string appDir;
    static string logPath;
    static string loginUrlPath;
    static string url;
    static string nodePath;
    static string[] nodeArgs;
    // 最近一次捕获的带 token 启动 URL(dsh web 每次启动都会换一个)。
    static string loginUrl;
    // 从子进程输出里抓 dsh web 的启动行。
    static readonly Regex LoginPattern = new Regex("dsh web:\\s*(https?://\\S*?token=[A-Za-z0-9_-]+)");
    // 落日志前把 token 打码。
    static readonly Regex TokenMask = new Regex("([?&]token=)[A-Za-z0-9_-]+");

    [STAThread]
    static void Main()
    {
        appDir = Path.GetDirectoryName(Application.ExecutablePath);
        if (appDir == null) return;
        if (!LoadConfig()) return;
        bool created;
        using (Mutex m = new Mutex(true, "Global\\DshTrayLauncher", out created))
        {
            if (!created) { OpenPage(); return; }
            try { Run(); }
            catch (Exception ex) { Log("[tray] " + ex); }
        }
    }

    static bool LoadConfig()
    {
        string cfg = Path.Combine(appDir, "dsh-tray.json");
        logPath = Path.Combine(appDir, "dsh-tray.log");
        loginUrlPath = Path.Combine(appDir, "dsh-tray-login-url.txt");
        if (!File.Exists(cfg)) return false;
        try
        {
            string text = File.ReadAllText(cfg);
            nodePath = JsonStr(text, "node");
            url = JsonStr(text, "url");
            if (string.IsNullOrEmpty(url)) url = "http://127.0.0.1:3080";
            nodeArgs = JsonArr(text, "args");
            // 托盘自己重启过也不丢:上次落盘的 URL 先读回来,复制前仍会验证它是否属于当前实例。
            loginUrl = ReadLoginUrlFile();
            return nodePath != null && nodeArgs != null;
        }
        catch (Exception ex)
        {
            Log("[config] " + ex);
            return false;
        }
    }

    static string JsonStr(string text, string key)
    {
        Match m = Regex.Match(text, "\"" + key + "\"\\s*:\\s*\"([^\"]*)\"");
        return m.Success ? m.Groups[1].Value : null;
    }

    static string[] JsonArr(string text, string key)
    {
        Match m = Regex.Match(text, "\"" + key + "\"\\s*:\\s*\\[([^\\]]*)\\]");
        if (!m.Success) return null;
        MatchCollection items = Regex.Matches(m.Groups[1].Value, "\"([^\"]*)\"");
        string[] arr = new string[items.Count];
        for (int i = 0; i < items.Count; i++) arr[i] = items[i].Groups[1].Value;
        return arr;
    }

    static bool PortUp()
    {
        try
        {
            HttpWebRequest req = (HttpWebRequest)WebRequest.Create(url);
            req.Timeout = 1200;
            using (HttpWebResponse res = (HttpWebResponse)req.GetResponse()) { return true; }
        }
        catch { return false; }
    }

    static void Run()
    {
        Application.EnableVisualStyles();
        tray = new NotifyIcon();
        string ico = Path.Combine(appDir, "whale.ico");
        if (File.Exists(ico)) tray.Icon = new Icon(ico);
        tray.Text = "DeepSeek Harness";
        tray.Visible = true;

        ContextMenuStrip menu = new ContextMenuStrip();
        ToolStripMenuItem show = new ToolStripMenuItem("显示页面");
        show.Click += delegate { OpenPage(); };
        ToolStripMenuItem copyLogin = new ToolStripMenuItem("复制登录 URL");
        copyLogin.Click += delegate { CopyLoginUrl(); };
        ToolStripMenuItem restart = new ToolStripMenuItem("重启");
        restart.Click += delegate { RestartDsh(); };
        ToolStripMenuItem quit = new ToolStripMenuItem("退出");
        quit.Click += delegate { Quit(); };
        menu.Items.Add(show);
        menu.Items.Add(copyLogin);
        menu.Items.Add(restart);
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add(quit);
        tray.ContextMenuStrip = menu;
        tray.DoubleClick += delegate { OpenPage(); };

        if (PortUp())
        {
            EnsurePortFree();
        }
        StartDsh();
        tray.BalloonTipTitle = "DeepSeek Harness";
        tray.BalloonTipText = "后台启动中…双击图标或右键打开页面。";
        tray.ShowBalloonTip(3000);

        Application.Run();
    }

    // 启动前确保端口空闲:自动结束之前占用该端口的进程(通常是旧 dsh 实例),再启动全新实例。
    static void EnsurePortFree()
    {
        int port = PortOf(url);
        int pid = port > 0 ? FindListenerPid(port) : 0;
        if (pid <= 0) return;
        Log("[dsh] killing previous listener pid=" + pid);
        KillProcessTree(pid);
        Balloon("已结束旧进程 (pid " + pid + ")，正在启动新实例…");
        for (int i = 0; i < 12; i++)
        {
            Thread.Sleep(500);
            if (!PortUp()) return;
        }
    }

    static void KillProcessTree(int pid)
    {
        try
        {
            ProcessStartInfo psi = new ProcessStartInfo("taskkill", "/PID " + pid + " /T /F");
            psi.UseShellExecute = false;
            psi.CreateNoWindow = true;
            Process.Start(psi);
        }
        catch (Exception ex) { Log("[kill] " + ex); }
    }

    static int PortOf(string u)
    {
        try { return new Uri(u).Port; }
        catch { return 0; }
    }

    // 用 netstat 找出监听某端口的进程 PID。
    static int FindListenerPid(int port)
    {
        try
        {
            ProcessStartInfo psi = new ProcessStartInfo("netstat", "-ano -p tcp");
            psi.UseShellExecute = false;
            psi.CreateNoWindow = true;
            psi.RedirectStandardOutput = true;
            using (Process p = Process.Start(psi))
            {
                string outText = p.StandardOutput.ReadToEnd();
                p.WaitForExit(2000);
                string needle = ":" + port;
                string[] lines = outText.Split('\n');
                for (int i = 0; i < lines.Length; i++)
                {
                    string line = lines[i];
                    if (line.IndexOf("LISTENING", StringComparison.OrdinalIgnoreCase) < 0) continue;
                    if (line.IndexOf(needle, StringComparison.OrdinalIgnoreCase) < 0) continue;
                    string[] parts = line.Trim().Split(new char[] { ' ' }, StringSplitOptions.RemoveEmptyEntries);
                    if (parts.Length > 0)
                    {
                        int pid;
                        if (int.TryParse(parts[parts.Length - 1], out pid) && pid > 0) return pid;
                    }
                }
            }
        }
        catch { }
        return 0;
    }

    static void StartDsh()
    {
        try
        {
            ProcessStartInfo psi = new ProcessStartInfo();
            psi.FileName = nodePath;
            psi.Arguments = string.Join(" ", QuoteArgs(nodeArgs));
            psi.UseShellExecute = false;
            psi.CreateNoWindow = true;
            psi.WindowStyle = ProcessWindowStyle.Hidden;
            psi.RedirectStandardOutput = true;
            psi.RedirectStandardError = true;
            child = Process.Start(psi);
            child.OutputDataReceived += delegate(object s, DataReceivedEventArgs e) { if (!string.IsNullOrEmpty(e.Data)) HandleDshLine(e.Data); };
            child.ErrorDataReceived += delegate(object s, DataReceivedEventArgs e) { if (!string.IsNullOrEmpty(e.Data)) HandleDshLine(e.Data); };
            child.EnableRaisingEvents = true;
            child.Exited += delegate { Log("[dsh] exited"); child = null; };
            child.BeginOutputReadLine();
            child.BeginErrorReadLine();
            Log("[dsh] started pid=" + child.Id);
        }
        catch (Exception ex) { Log("[start] " + ex); }
    }

    static string[] QuoteArgs(string[] args)
    {
        string[] q = new string[args.Length];
        for (int i = 0; i < args.Length; i++)
        {
            string a = args[i];
            q[i] = (a.IndexOf(' ') >= 0 || a.IndexOf('"') >= 0) ? "\"" + a.Replace("\"", "\\\"") + "\"" : a;
        }
        return q;
    }

    // dsh 子进程的每一行:尝试捕获登录 URL,其余按原样记日志(token 打码)。
    static void HandleDshLine(string line)
    {
        Match m = LoginPattern.Match(line);
        if (m.Success)
        {
            loginUrl = m.Groups[1].Value;
            WriteLoginUrlFile(loginUrl);
            Log("[login] 已捕获登录 URL(右键「复制登录 URL」即可粘贴到扩展登录框)");
            return;
        }
        Log(TokenMask.Replace(line, "$1***"));
    }

    static void WriteLoginUrlFile(string value)
    {
        try { File.WriteAllText(loginUrlPath, value + "\r\n", new UTF8Encoding(false)); }
        catch (Exception ex) { Log("[login] 写入 " + Path.GetFileName(loginUrlPath) + " 失败:" + ex.Message); }
    }

    static string ReadLoginUrlFile()
    {
        try
        {
            if (!File.Exists(loginUrlPath)) return null;
            string text = File.ReadAllText(loginUrlPath).Trim();
            return text.Length == 0 ? null : text;
        }
        catch { return null; }
    }

    // 验证 token 是否属于「当前正在运行的」dsh:有效 token 的兑换请求返回 303 并下发会话 cookie;
    // 旧版无鉴权服务返回 200;token 失效返回 401(WebException),连接不上也返回 false。
    static bool LoginUrlUsable(string candidate)
    {
        if (string.IsNullOrEmpty(candidate)) return false;
        try
        {
            HttpWebRequest req = (HttpWebRequest)WebRequest.Create(candidate);
            req.Timeout = 2500;
            req.AllowAutoRedirect = false;
            using (HttpWebResponse res = (HttpWebResponse)req.GetResponse())
            {
                int code = (int)res.StatusCode;
                return code == 303 || code == 200;
            }
        }
        catch (WebException wex)
        {
            HttpWebResponse res = wex.Response as HttpWebResponse;
            if (res == null) return false;
            int code = (int)res.StatusCode;
            res.Close();
            return code == 303 || code == 200;
        }
        catch { return false; }
    }

    static string ResolveLoginUrl()
    {
        if (LoginUrlUsable(loginUrl)) return loginUrl;
        string fromFile = ReadLoginUrlFile();
        if (LoginUrlUsable(fromFile)) { loginUrl = fromFile; return fromFile; }
        return null;
    }

    // 复制「当前这次 dsh web」的登录 URL。取不到或已失效就明确告知,绝不复制一个死 token。
    static void CopyLoginUrl()
    {
        string found = ResolveLoginUrl();
        if (found == null)
        {
            Balloon("没拿到可用的登录 URL:当前的 dsh web 可能不是本托盘启动的(或 token 已失效)。请先用「重启」让托盘重新拉起 dsh,再复制。");
            Log("[login] 复制失败:没有属于当前 dsh 的可用启动 URL");
            return;
        }
        if (SetClipboardText(found)) Balloon("已复制登录 URL(会话 30 天有效)，粘贴到 DSH 面板的登录框即可。");
        else Balloon("剪贴板被占用，复制失败，请稍后重试。");
    }

    static bool SetClipboardText(string text)
    {
        for (int i = 0; i < 5; i++)
        {
            try { Clipboard.SetText(text); return true; }
            catch { Thread.Sleep(120); }
        }
        return false;
    }

    static void Log(string line)
    {
        try { File.AppendAllText(logPath, DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss") + " " + line + "\r\n"); }
        catch { }
    }

    static void OpenPage()
    {
        try { Process.Start(new ProcessStartInfo(url) { UseShellExecute = true }); }
        catch (Exception ex) { Log("[open] " + ex); }
    }

    // 重启:仅当托盘拥有子进程时有效 —— 结束其进程树再重新拉起。
    static void RestartDsh()
    {
        if (child == null || child.HasExited)
        {
            Balloon("当前 dsh 不是由本托盘启动，无法重启。");
            return;
        }
        Balloon("正在重启 dsh web…");
        KillProcessTree(child.Id);
        try { child.WaitForExit(6000); } catch { }
        StartDsh();
        Balloon("重启完成。");
    }

    static void Balloon(string text)
    {
        try
        {
            tray.BalloonTipTitle = "DeepSeek Harness";
            tray.BalloonTipText = text;
            tray.ShowBalloonTip(2500);
        }
        catch { }
    }

    static void Quit()
    {
        if (child != null && !child.HasExited)
        {
            KillProcessTree(child.Id);
            try { child.WaitForExit(3000); } catch { }
        }
        if (tray != null) { tray.Visible = false; tray.Dispose(); }
        Application.Exit();
    }
}
