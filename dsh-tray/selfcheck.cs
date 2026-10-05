// dsh-tray/selfcheck.cs — DshTray.exe 的离线自检（不启动托盘、不碰正在跑的 dsh）。
//
// 做法：反射加载编译好的 DshTray.exe，把 logPath/loginUrlPath 改到临时文件，
// 直接调用其内部方法验证「复制登录 URL」这条链路：
//   启动行捕获 → 落盘 dsh-tray-login-url.txt → 日志里 token 打码
//   → token 有效性判定（真 token=303 可用 / 假 token 不可用）
//   → 剪贴板往返 → ResolveLoginUrl 的回退路径
//
// 编译（同 build-tray.ps1 的 csc）：
//   csc /nologo /target:exe /r:System.Windows.Forms.dll /out:selfcheck.exe selfcheck.cs
// 运行：
//   selfcheck.exe <DshTray.exe 路径> <当前实例的登录 URL>
using System;
using System.IO;
using System.Reflection;
using System.Windows.Forms;

class TraySelfCheck
{
    static int fails = 0;

    static void Check(string name, bool ok, string detail)
    {
        Console.WriteLine((ok ? "PASS  " : "FAIL  ") + name + (ok || detail == null ? "" : "  -> " + detail));
        if (!ok) fails++;
    }

    [STAThread]
    static void Main(string[] args)
    {
        if (args.Length < 2)
        {
            Console.WriteLine("usage: selfcheck.exe <DshTray.exe> <login-url>");
            Environment.Exit(2);
        }
        string exePath = args[0];
        string realUrl = args[1];

        string tempLog = Path.Combine(Path.GetTempPath(), "dsh-tray-selfcheck.log");
        string tempUrlFile = Path.Combine(Path.GetTempPath(), "dsh-tray-selfcheck-url.txt");
        if (File.Exists(tempLog)) File.Delete(tempLog);
        if (File.Exists(tempUrlFile)) File.Delete(tempUrlFile);

        Assembly asm = Assembly.LoadFrom(exePath);
        Type t = asm.GetType("DshTrayApp");
        Check("类型 DshTrayApp 存在", t != null, null);
        if (t == null) { Environment.Exit(1); }

        const BindingFlags F = BindingFlags.NonPublic | BindingFlags.Static;
        t.GetField("logPath", F).SetValue(null, tempLog);
        t.GetField("loginUrlPath", F).SetValue(null, tempUrlFile);

        MethodInfo handle = t.GetMethod("HandleDshLine", F);
        MethodInfo usable = t.GetMethod("LoginUrlUsable", F);
        MethodInfo resolve = t.GetMethod("ResolveLoginUrl", F);
        MethodInfo setClip = t.GetMethod("SetClipboardText", F);
        Check("四个内部方法都在",
            handle != null && usable != null && resolve != null && setClip != null,
            "HandleDshLine=" + (handle != null) + " LoginUrlUsable=" + (usable != null) + " ResolveLoginUrl=" + (resolve != null) + " SetClipboardText=" + (setClip != null));
        if (handle == null || usable == null || resolve == null || setClip == null) { Environment.Exit(1); }

        // 1) 捕获启动行 → 落盘，且日志里不留 token
        string sample = "2026-10-05 12:00:00 dsh web: http://127.0.0.1:3080/?token=SAMPLETOKEN123";
        handle.Invoke(null, new object[] { sample });
        string written = File.Exists(tempUrlFile) ? File.ReadAllText(tempUrlFile).Trim() : null;
        Check("捕获启动行后落盘 dsh-tray-login-url.txt",
            written == "http://127.0.0.1:3080/?token=SAMPLETOKEN123", written);
        string logText = File.Exists(tempLog) ? File.ReadAllText(tempLog) : "";
        Check("启动行里的 token 不写进日志", logText.IndexOf("SAMPLETOKEN123") < 0, logText.Trim());
        Check("启动行写了 [login] 提示", logText.IndexOf("[login]") >= 0, logText.Trim());

        // 2) 普通行里的 token 也打码
        handle.Invoke(null, new object[] { "some noisy line ?token=SECRETVALUE&x=1" });
        logText = File.ReadAllText(tempLog);
        Check("普通行的 token 被打码", logText.IndexOf("SECRETVALUE") < 0 && logText.IndexOf("token=***") >= 0, logText.Trim());

        // 3) token 有效性判定
        Check("真实 token 判定可用（兑换返回 303/200）", (bool)usable.Invoke(null, new object[] { realUrl }), "url 未取到");
        Check("假 token 判定不可用", !(bool)usable.Invoke(null, new object[] { "http://127.0.0.1:3080/?token=deadbeefdeadbeefdeadbeef" }), null);
        Check("空值判定不可用", !(bool)usable.Invoke(null, new object[] { null }), null);

        // 4) 剪贴板往返
        string probe = "dsh-tray-probe-" + DateTime.Now.Ticks;
        bool copied = (bool)setClip.Invoke(null, new object[] { probe });
        Check("SetClipboardText 报告成功", copied, null);
        Check("剪贴板内容往返一致", Clipboard.GetText() == probe, Clipboard.GetText());

        // 5) 内存里的失效 URL 必须回退到落盘文件
        File.WriteAllText(tempUrlFile, realUrl);
        t.GetField("loginUrl", F).SetValue(null, "http://127.0.0.1:3080/?token=deadbeefdeadbeefdeadbeef");
        string resolved = (string)resolve.Invoke(null, null);
        Check("失效的内存 URL 回退到落盘文件", resolved == realUrl, resolved);

        Console.WriteLine(fails == 0 ? "\nALL CHECKS PASSED" : "\n" + fails + " CHECK(S) FAILED");
        Environment.Exit(fails == 0 ? 0 : 1);
    }
}
