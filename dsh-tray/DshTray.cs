// DshTray — DeepSeek Harness 系统托盘启动器
// 编译:build-tray.ps1(csc /target:winexe /win32icon:whale.ico)
// 兼容 C# 5 / .NET Framework 4.x(不用字符串插值等新语法)。
// 行为:
//  1. 启动时若 http://127.0.0.1:3080 已在响应 → 弹气泡 + 打开页面,不重复起 dsh;
//  2. 否则后台启动 dsh web(node bin.js --profile web --host 127.0.0.1 --port 3080),
//     窗口隐藏,stdout/stderr 追加到 dsh-tray.log;
//  3. 右下角托盘鲸鱼图标;左键双击打开页面;右键菜单:显示页面 / 退出;
//  4. 退出:taskkill /T 结束自己启动的 dsh 进程树,再退出托盘。
using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Text.RegularExpressions;
using System.Threading;
using System.Windows.Forms;

public class DshTrayApp
{
    static NotifyIcon tray;
    static Process child;
    static string appDir;
    static string logPath;
    static string url;
    static string nodePath;
    static string[] nodeArgs;

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
        if (!File.Exists(cfg)) return false;
        try
        {
            string text = File.ReadAllText(cfg);
            nodePath = JsonStr(text, "node");
            url = JsonStr(text, "url");
            if (string.IsNullOrEmpty(url)) url = "http://127.0.0.1:3080";
            nodeArgs = JsonArr(text, "args");
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
        ToolStripMenuItem restart = new ToolStripMenuItem("重启");
        restart.Click += delegate { RestartDsh(); };
        ToolStripMenuItem quit = new ToolStripMenuItem("退出");
        quit.Click += delegate { Quit(); };
        menu.Items.Add(show);
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
            child.OutputDataReceived += delegate(object s, DataReceivedEventArgs e) { if (!string.IsNullOrEmpty(e.Data)) Log(e.Data); };
            child.ErrorDataReceived += delegate(object s, DataReceivedEventArgs e) { if (!string.IsNullOrEmpty(e.Data)) Log(e.Data); };
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
