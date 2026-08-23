using System.Diagnostics;
using System.Globalization;
using System.Text.Json;
using System.Windows.Automation;

namespace DshComputerUseHelper;

internal sealed record TargetDto(
    string TargetId,
    string Kind,
    string Title,
    string? Process);

internal sealed record RectDto(double X, double Y, double Width, double Height);

internal sealed record ElementDto(
    string ElementId,
    string Role,
    string? Name,
    RectDto Bounds);

internal sealed record AccessibilityDto(
    string Tree,
    string? FocusedElement,
    string? SelectedText,
    string? DocumentText,
    IReadOnlyList<ElementDto> Elements);

internal sealed record ViewportDto(int Width, int Height, double Dpr);

internal sealed record ObservationDto(
    string SessionId,
    string TargetId,
    string ObservationId,
    string CreatedAt,
    string ExpiresAt,
    long Sequence,
    string Title,
    ViewportDto Viewport,
    NativeScreenshot? Screenshot,
    AccessibilityDto? Accessibility);

internal sealed record TargetState(
    string TargetId,
    IntPtr Hwnd,
    uint ProcessId,
    string ProcessName,
    string Title)
{
    internal TargetDto ToDto() => new(TargetId, "window", Title, ProcessName.Length == 0 ? null : ProcessName);
}

internal sealed record ElementState(AutomationElement Element, RectDto Bounds);

internal sealed class ObservationState
{
    internal required ObservationDto Dto { get; init; }
    internal required DateTimeOffset ExpiresAt { get; init; }
    internal required NativeMethods.Rect WindowRect { get; init; }
    internal required IReadOnlyDictionary<string, ElementState> Elements { get; init; }
    internal required bool IncludedScreenshot { get; init; }
    internal required bool IncludedAccessibility { get; init; }
}

internal sealed class SessionState
{
    internal Dictionary<string, TargetState> Targets { get; } = new(StringComparer.Ordinal);
    internal Dictionary<string, ObservationState> Observations { get; } = new(StringComparer.Ordinal);
    internal bool Interrupted { get; set; }
}

internal sealed class WindowsComputerUseServer : IDisposable
{
    private static readonly TimeSpan ObservationTtl = TimeSpan.FromSeconds(30);
    private static readonly HashSet<string> SensitiveProcesses = new(StringComparer.OrdinalIgnoreCase)
    {
        "credentialuibroker",
        "consent",
        "logonui",
        "lockapp",
        "securityhealthhost",
        "securityhealthservice",
        "1password",
        "bitwarden",
        "keepass",
        "keepassxc",
        // Terminal / shell hosts are never valid automation targets.
        "cmd",
        "conhost",
        "openconsole",
        "powershell",
        "pwsh",
        "windowspowershell",
        "windowsterminal",
    };

    private readonly Dictionary<string, SessionState> _sessions = new(StringComparer.Ordinal);
    private readonly HashSet<string> _stoppedSessions = new(StringComparer.Ordinal);
    private readonly KillSwitch _killSwitch = new();
    private long _sequence;
    private string? _windowState;

    internal void SetWindowState(string? state) => _windowState = state;

    internal object Dispatch(string method, JsonElement parameters)
    {
        return method switch
        {
            "listTargets" => ListTargets(parameters),
            "observe" => Observe(parameters),
            "act" => Act(parameters),
            "stop" => Stop(parameters),
            _ => throw new HelperException("ACTION_NOT_SUPPORTED", "unknown native helper method"),
        };
    }

    private object ListTargets(JsonElement parameters)
    {
        var sessionId = RequiredString(parameters, "sessionId");
        if (_stoppedSessions.Contains(sessionId))
        {
            throw new HelperException("SESSION_NOT_FOUND", "the session has already been stopped");
        }
        if (!_sessions.TryGetValue(sessionId, out var session))
        {
            session = new SessionState();
            _sessions.Add(sessionId, session);
        }

        var targets = EnumerateTargets();
        session.Targets.Clear();
        foreach (var target in targets) session.Targets[target.TargetId] = target;
        CleanupObservationsForMissingTargets(session);
        return new { targets = targets.Select(target => target.ToDto()).ToArray() };
    }

    private object Observe(JsonElement parameters)
    {
        var sessionId = RequiredString(parameters, "sessionId");
        var targetId = RequiredString(parameters, "targetId");
        var session = GetSession(sessionId);
        session.Interrupted = false;
        var target = ResolveTarget(session, targetId);

        var include = parameters.GetProperty("include");
        var includeScreenshot = include.TryGetProperty("screenshot", out var screenshot) && screenshot.GetBoolean();
        var includeAccessibility = include.TryGetProperty("accessibility", out var accessibility) && accessibility.GetBoolean();
        var observation = CaptureObservation(
            sessionId,
            session,
            target,
            includeScreenshot,
            includeAccessibility,
            CancellationToken.None);
        return new { observation = observation.Dto };
    }

    private object Act(JsonElement parameters)
    {
        var sessionId = RequiredString(parameters, "sessionId");
        var targetId = RequiredString(parameters, "targetId");
        var observationId = RequiredString(parameters, "observationId");
        var session = GetSession(sessionId);
        if (session.Interrupted)
        {
            throw new HelperException("USER_INTERRUPTED", "re-observe after the Escape kill switch was used");
        }
        var target = ResolveTarget(session, targetId);
        if (!session.Observations.TryGetValue(targetId, out var observation)
            || !observation.Dto.ObservationId.Equals(observationId, StringComparison.Ordinal)
            || DateTimeOffset.UtcNow > observation.ExpiresAt)
        {
            throw new HelperException("STALE_OBSERVATION", "observation is stale; re-observe before acting");
        }

        using var armed = _killSwitch.Arm();
        try
        {
            this.DispatchAction(target, observation, parameters.GetProperty("action"), armed.Token);
            armed.Token.ThrowIfCancellationRequested();
            Thread.Sleep(150);
            armed.Token.ThrowIfCancellationRequested();

            var next = CaptureObservation(
                sessionId,
                session,
                target,
                observation.IncludedScreenshot,
                observation.IncludedAccessibility,
                armed.Token);
            return new { observation = next.Dto };
        }
        catch (OperationCanceledException)
        {
            session.Interrupted = true;
            throw;
        }
    }

    private object Stop(JsonElement parameters)
    {
        var sessionId = RequiredString(parameters, "sessionId");
        if (_sessions.Remove(sessionId, out var session)) CleanupSession(session);
        _stoppedSessions.Add(sessionId);
        return new { };
    }

    private ObservationState CaptureObservation(
        string sessionId,
        SessionState session,
        TargetState target,
        bool includeScreenshot,
        bool includeAccessibility,
        CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        target = ResolveTarget(session, target.TargetId);
        if (!NativeMethods.GetWindowRect(target.Hwnd, out var windowRect)
            || windowRect.Width <= 0
            || windowRect.Height <= 0)
        {
            throw new HelperException("TARGET_CHANGED", "target window has no usable bounds");
        }

        var sequence = Interlocked.Increment(ref _sequence);
        var observationId = $"win-obs-{sequence}-{Guid.NewGuid():N}";
        var createdAt = DateTimeOffset.UtcNow;
        var expiresAt = createdAt.Add(ObservationTtl);
        NativeScreenshot? screenshot = null;
        var width = windowRect.Width;
        var height = windowRect.Height;
        if (includeScreenshot)
        {
            screenshot = WgcCapture.CaptureWindow(
                target.Hwnd,
                $"win-shot-{sequence}-{Guid.NewGuid():N}",
                cancellationToken);
            width = screenshot.Width;
            height = screenshot.Height;
        }

        AccessibilityDto? accessibility = null;
        IReadOnlyDictionary<string, ElementState> elements = new Dictionary<string, ElementState>();
        if (includeAccessibility)
        {
            var snapshot = UiaSnapshot.Capture(target.Hwnd, windowRect, width, height, sequence, cancellationToken);
            accessibility = snapshot.Dto;
            elements = snapshot.Elements;
        }

        var currentTitle = NativeMethods.GetWindowTitle(target.Hwnd);
        var dto = new ObservationDto(
            sessionId,
            target.TargetId,
            observationId,
            createdAt.ToString("O", CultureInfo.InvariantCulture),
            expiresAt.ToString("O", CultureInfo.InvariantCulture),
            sequence,
            currentTitle.Length > 0 ? currentTitle : target.Title,
            new ViewportDto(width, height, 1),
            screenshot,
            accessibility);
        var state = new ObservationState
        {
            Dto = dto,
            ExpiresAt = expiresAt,
            WindowRect = windowRect,
            Elements = elements,
            IncludedScreenshot = includeScreenshot,
            IncludedAccessibility = includeAccessibility,
        };

        if (session.Observations.Remove(target.TargetId, out var previous))
        {
            TempScreenshotStore.Delete(previous.Dto.Screenshot?.FilePath);
        }
        session.Observations[target.TargetId] = state;
        return state;
    }

    private void DispatchAction(
        TargetState target,
        ObservationState observation,
        JsonElement action,
        CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var type = RequiredString(action, "type");
        switch (type)
        {
            case "click-element":
            {
                var element = ResolveElement(observation, RequiredString(action, "elementId"));
                this.Activate(target.Hwnd);
                if (!TryInvoke(element.Element))
                {
                    var point = Center(element.Bounds);
                    InputDispatcher.Click(
                        ToScreenX(observation, point.X),
                        ToScreenY(observation, point.Y),
                        "left");
                }
                break;
            }
            case "click-coordinate":
            {
                ValidateScreenshot(observation, RequiredString(action, "screenshotId"));
                var x = RequiredDouble(action, "x");
                var y = RequiredDouble(action, "y");
                ValidatePoint(observation, x, y);
                this.Activate(target.Hwnd);
                InputDispatcher.Click(
                    ToScreenX(observation, x),
                    ToScreenY(observation, y),
                    RequiredString(action, "button"));
                break;
            }
            case "type-text":
            {
                var text = RequiredString(action, "text");
                if (text.Length > 4096) throw new HelperException("ACTION_NOT_SUPPORTED", "text input exceeds 4096 characters");
                this.Activate(target.Hwnd);
                InputDispatcher.TypeText(text, cancellationToken);
                break;
            }
            case "press-key":
            {
                var keys = action.GetProperty("keys").EnumerateArray().Select(value => value.GetString() ?? string.Empty).ToArray();
                if (keys.Length == 0 || keys.Length > 8)
                {
                    throw new HelperException("ACTION_NOT_SUPPORTED", "press-key accepts one to eight keys");
                }
                this.Activate(target.Hwnd);
                InputDispatcher.PressKeys(keys);
                break;
            }
            case "scroll":
            {
                var deltaX = RequiredInt(action, "deltaX");
                var deltaY = RequiredInt(action, "deltaY");
                this.Activate(target.Hwnd);
                InputDispatcher.Scroll(
                    observation.WindowRect.Left + observation.WindowRect.Width / 2,
                    observation.WindowRect.Top + observation.WindowRect.Height / 2,
                    deltaX,
                    deltaY);
                break;
            }
            case "drag":
            {
                ValidateScreenshot(observation, RequiredString(action, "screenshotId"));
                var from = action.GetProperty("from");
                var to = action.GetProperty("to");
                var fromX = RequiredDouble(from, "x");
                var fromY = RequiredDouble(from, "y");
                var toX = RequiredDouble(to, "x");
                var toY = RequiredDouble(to, "y");
                ValidatePoint(observation, fromX, fromY);
                ValidatePoint(observation, toX, toY);
                this.Activate(target.Hwnd);
                InputDispatcher.Drag(
                    ToScreenX(observation, fromX),
                    ToScreenY(observation, fromY),
                    ToScreenX(observation, toX),
                    ToScreenY(observation, toY),
                    cancellationToken);
                break;
            }
            case "set-value":
            {
                var element = ResolveElement(observation, RequiredString(action, "elementId"));
                var value = RequiredString(action, "value");
                if (value.Length > 4096) throw new HelperException("ACTION_NOT_SUPPORTED", "value exceeds 4096 characters");
                this.Activate(target.Hwnd);
                if (!TrySetValue(element.Element, value))
                {
                    try { element.Element.SetFocus(); } catch { }
                    InputDispatcher.PressKeys(["CTRL", "A"]);
                    InputDispatcher.TypeText(value, cancellationToken);
                }
                break;
            }
            case "activate-target":
                this.Activate(target.Hwnd);
                break;
            default:
                throw new HelperException("ACTION_NOT_SUPPORTED", "unsupported Windows computer action");
        }
        cancellationToken.ThrowIfCancellationRequested();
    }

    private static bool TryInvoke(AutomationElement element)
    {
        try
        {
            if (element.TryGetCurrentPattern(InvokePattern.Pattern, out var invoke))
            {
                ((InvokePattern)invoke).Invoke();
                return true;
            }
            if (element.TryGetCurrentPattern(SelectionItemPattern.Pattern, out var selection))
            {
                ((SelectionItemPattern)selection).Select();
                return true;
            }
            if (element.TryGetCurrentPattern(TogglePattern.Pattern, out var toggle))
            {
                ((TogglePattern)toggle).Toggle();
                return true;
            }
            if (element.TryGetCurrentPattern(ExpandCollapsePattern.Pattern, out var expand))
            {
                var pattern = (ExpandCollapsePattern)expand;
                if (pattern.Current.ExpandCollapseState == ExpandCollapseState.Collapsed) pattern.Expand();
                else if (pattern.Current.ExpandCollapseState == ExpandCollapseState.Expanded) pattern.Collapse();
                else return false;
                return true;
            }
        }
        catch (ElementNotAvailableException)
        {
            throw new HelperException("ELEMENT_NOT_FOUND", "element is no longer available; re-observe");
        }
        return false;
    }

    private static bool TrySetValue(AutomationElement element, string value)
    {
        try
        {
            if (!element.TryGetCurrentPattern(ValuePattern.Pattern, out var raw)) return false;
            var pattern = (ValuePattern)raw;
            if (pattern.Current.IsReadOnly)
            {
                throw new HelperException("ACTION_NOT_SUPPORTED", "element value is read-only");
            }
            pattern.SetValue(value);
            return true;
        }
        catch (ElementNotAvailableException)
        {
            throw new HelperException("ELEMENT_NOT_FOUND", "element is no longer available; re-observe");
        }
    }

    private static ElementState ResolveElement(ObservationState observation, string elementId)
    {
        if (!observation.Elements.TryGetValue(elementId, out var element))
        {
            throw new HelperException("ELEMENT_NOT_FOUND", "element id is not in the current observation");
        }
        return element;
    }

    private static void ValidateScreenshot(ObservationState observation, string screenshotId)
    {
        if (observation.Dto.Screenshot?.ScreenshotId != screenshotId)
        {
            throw new HelperException("STALE_OBSERVATION", "screenshot id is stale; re-observe before acting");
        }
    }

    private static void ValidatePoint(ObservationState observation, double x, double y)
    {
        if (!double.IsFinite(x)
            || !double.IsFinite(y)
            || x < 0
            || y < 0
            || x >= observation.Dto.Viewport.Width
            || y >= observation.Dto.Viewport.Height)
        {
            throw new HelperException("COORDINATE_OUT_OF_BOUNDS", "coordinate is outside the observed window");
        }
    }

    private static int ToScreenX(ObservationState observation, double x)
    {
        var scale = observation.WindowRect.Width / (double)Math.Max(1, observation.Dto.Viewport.Width);
        return observation.WindowRect.Left + (int)Math.Round(x * scale);
    }

    private static int ToScreenY(ObservationState observation, double y)
    {
        var scale = observation.WindowRect.Height / (double)Math.Max(1, observation.Dto.Viewport.Height);
        return observation.WindowRect.Top + (int)Math.Round(y * scale);
    }

    private static (double X, double Y) Center(RectDto bounds) =>
        (bounds.X + bounds.Width / 2, bounds.Y + bounds.Height / 2);

    private void Activate(IntPtr hwnd)
    {
        if (NativeMethods.IsIconic(hwnd)) NativeMethods.ShowWindowAsync(hwnd, NativeMethods.SwRestore);
        NativeMethods.BringWindowToTop(hwnd);
        NativeMethods.SetForegroundWindow(hwnd);
        Thread.Sleep(40);
        // Apply the configured window state AFTER the window is up (launch-then-size).
        switch (_windowState)
        {
            case "maximized":
                NativeMethods.ShowWindowAsync(hwnd, NativeMethods.SwMaximize);
                break;
            case "minimized":
                NativeMethods.ShowWindowAsync(hwnd, NativeMethods.SwMinimize);
                break;
        }
    }

    private SessionState GetSession(string sessionId)
    {
        if (!_sessions.TryGetValue(sessionId, out var session))
        {
            throw new HelperException("SESSION_NOT_FOUND", "unknown or stopped Windows computer-use session");
        }
        return session;
    }

    private static TargetState ResolveTarget(SessionState session, string targetId)
    {
        if (!session.Targets.TryGetValue(targetId, out var target))
        {
            throw new HelperException("TARGET_NOT_FOUND", "target does not belong to this session");
        }
        if (!NativeMethods.IsWindow(target.Hwnd))
        {
            throw new HelperException("TARGET_CHANGED", "target window no longer exists");
        }
        NativeMethods.GetWindowThreadProcessId(target.Hwnd, out var processId);
        if (processId != target.ProcessId)
        {
            throw new HelperException("TARGET_CHANGED", "target window identity changed");
        }
        EnsureTargetAllowed(target.ProcessName, NativeMethods.GetWindowTitle(target.Hwnd));
        return target;
    }

    private static List<TargetState> EnumerateTargets()
    {
        var targets = new List<TargetState>();
        var ownProcess = (uint)Environment.ProcessId;
        NativeMethods.EnumWindows((hwnd, _) =>
        {
            try
            {
                if (!NativeMethods.IsWindowVisible(hwnd) || NativeMethods.IsCloaked(hwnd)) return true;
                if (!NativeMethods.GetWindowRect(hwnd, out var rect) || rect.Width < 2 || rect.Height < 2) return true;
                var title = NativeMethods.GetWindowTitle(hwnd);
                if (title.Length == 0) return true;
                NativeMethods.GetWindowThreadProcessId(hwnd, out var processId);
                if (processId == 0 || processId == ownProcess) return true;
                var processName = GetProcessName(processId);
                if (IsTargetSensitive(processName, title)) return true;
                var targetId = $"win-{processId}-{hwnd.ToInt64():x}";
                targets.Add(new TargetState(targetId, hwnd, processId, processName, title));
            }
            catch
            {
                // A window can disappear during EnumWindows; skip that entry.
            }
            return true;
        }, IntPtr.Zero);
        return targets
            .OrderBy(target => target.ProcessName, StringComparer.OrdinalIgnoreCase)
            .ThenBy(target => target.Title, StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    private static string GetProcessName(uint processId)
    {
        try
        {
            using var process = Process.GetProcessById(checked((int)processId));
            return process.ProcessName;
        }
        catch
        {
            return string.Empty;
        }
    }

    private static bool IsTargetSensitive(string processName, string title)
    {
        if (SensitiveProcesses.Contains(processName)) return true;
        return title.Contains("Windows Security", StringComparison.OrdinalIgnoreCase)
            || title.Contains("User Account Control", StringComparison.OrdinalIgnoreCase)
            || title.Contains("Windows 安全中心", StringComparison.OrdinalIgnoreCase)
            || title.Contains("用户帐户控制", StringComparison.OrdinalIgnoreCase)
            // Terminal / shell titles, independent of the host process.
            || title.Contains("cmd.exe", StringComparison.OrdinalIgnoreCase)
            || title.Contains("command prompt", StringComparison.OrdinalIgnoreCase)
            || title.Contains("powershell", StringComparison.OrdinalIgnoreCase)
            || title.Contains("windows terminal", StringComparison.OrdinalIgnoreCase)
            || title.Contains("命令提示符", StringComparison.OrdinalIgnoreCase);
    }

    private static void EnsureTargetAllowed(string processName, string title)
    {
        if (IsTargetSensitive(processName, title))
        {
            throw new HelperException("TARGET_NOT_ALLOWED", "security, authentication, and password-manager windows are blocked");
        }
    }

    private static string RequiredString(JsonElement value, string name)
    {
        var result = value.GetProperty(name).GetString();
        if (string.IsNullOrWhiteSpace(result)) throw new JsonException($"{name} must be a non-empty string");
        return result;
    }

    private static int RequiredInt(JsonElement value, string name) => value.GetProperty(name).GetInt32();
    private static double RequiredDouble(JsonElement value, string name) => value.GetProperty(name).GetDouble();

    private static void CleanupObservationsForMissingTargets(SessionState session)
    {
        foreach (var targetId in session.Observations.Keys.Where(id => !session.Targets.ContainsKey(id)).ToArray())
        {
            var observation = session.Observations[targetId];
            TempScreenshotStore.Delete(observation.Dto.Screenshot?.FilePath);
            session.Observations.Remove(targetId);
        }
    }

    private static void CleanupSession(SessionState session)
    {
        foreach (var observation in session.Observations.Values)
        {
            TempScreenshotStore.Delete(observation.Dto.Screenshot?.FilePath);
        }
        session.Observations.Clear();
        session.Targets.Clear();
    }

    public void Dispose()
    {
        foreach (var session in _sessions.Values) CleanupSession(session);
        _sessions.Clear();
        _killSwitch.Dispose();
    }
}

internal sealed record UiaSnapshot(
    AccessibilityDto Dto,
    IReadOnlyDictionary<string, ElementState> Elements)
{
    private const int MaxNodes = 350;
    private const int MaxDepth = 10;
    private const int MaxTextLength = 6000;

    private static readonly HashSet<ControlType> ActionableTypes =
    [
        ControlType.Button,
        ControlType.Calendar,
        ControlType.CheckBox,
        ControlType.ComboBox,
        ControlType.Custom,
        ControlType.DataItem,
        ControlType.Edit,
        ControlType.Hyperlink,
        ControlType.ListItem,
        ControlType.MenuItem,
        ControlType.RadioButton,
        ControlType.Slider,
        ControlType.Spinner,
        ControlType.SplitButton,
        ControlType.TabItem,
        ControlType.Thumb,
        ControlType.TreeItem,
    ];

    internal static UiaSnapshot Capture(
        IntPtr hwnd,
        NativeMethods.Rect windowRect,
        int viewportWidth,
        int viewportHeight,
        long sequence,
        CancellationToken cancellationToken)
    {
        AutomationElement root;
        try
        {
            root = AutomationElement.FromHandle(hwnd);
        }
        catch (ElementNotAvailableException)
        {
            throw new HelperException("TARGET_CHANGED", "UI Automation target is no longer available");
        }

        var lines = new List<string>();
        var dtoElements = new List<ElementDto>();
        var elementStates = new Dictionary<string, ElementState>(StringComparer.Ordinal);
        var runtimeIds = new Dictionary<string, string>(StringComparer.Ordinal);
        var walker = TreeWalker.ControlViewWalker;
        var visited = 0;

        void Visit(AutomationElement element, int depth)
        {
            if (visited >= MaxNodes || depth > MaxDepth) return;
            cancellationToken.ThrowIfCancellationRequested();
            visited++;

            string role;
            string name;
            bool enabled;
            System.Windows.Rect rawBounds;
            try
            {
                var current = element.Current;
                role = NormalizeRole(current.ControlType);
                name = Sanitize(current.Name, 160);
                enabled = current.IsEnabled;
                rawBounds = current.BoundingRectangle;
            }
            catch (ElementNotAvailableException)
            {
                return;
            }

            var relative = ToRelativeBounds(rawBounds, windowRect, viewportWidth, viewportHeight);
            string? elementId = null;
            if (enabled && relative is not null && IsActionable(element, role))
            {
                elementId = $"win-el-{sequence}-{dtoElements.Count + 1}";
                dtoElements.Add(new ElementDto(elementId, role, name.Length == 0 ? null : name, relative));
                elementStates[elementId] = new ElementState(element, relative);
                try
                {
                    runtimeIds[RuntimeIdKey(element.GetRuntimeId())] = elementId;
                }
                catch
                {
                    // Runtime IDs are optional metadata only.
                }
            }

            var marker = elementId is null ? "-" : $"[{elementId}]";
            var label = name.Length == 0 ? role : $"{role} \"{name}\"";
            lines.Add($"{new string(' ', depth * 2)}{marker} {label}");

            if (depth >= MaxDepth || visited >= MaxNodes) return;
            AutomationElement? child;
            try { child = walker.GetFirstChild(element); }
            catch (ElementNotAvailableException) { return; }
            while (child is not null && visited < MaxNodes)
            {
                Visit(child, depth + 1);
                try { child = walker.GetNextSibling(child); }
                catch (ElementNotAvailableException) { break; }
            }
        }

        Visit(root, 0);
        string? focusedElement = null;
        try
        {
            var focused = AutomationElement.FocusedElement;
            if (focused is not null) runtimeIds.TryGetValue(RuntimeIdKey(focused.GetRuntimeId()), out focusedElement);
        }
        catch
        {
            // Focus can change between the tree walk and this lookup.
        }

        var selectedText = ReadSelectedText(root);
        var documentText = ReadDocumentText(root);
        if (visited >= MaxNodes) lines.Add($"... truncated after {MaxNodes} UIA nodes");
        var tree = string.Join(Environment.NewLine, lines);
        if (tree.Length > MaxTextLength) tree = tree[..MaxTextLength] + Environment.NewLine + "... tree text truncated";
        return new UiaSnapshot(
            new AccessibilityDto(tree, focusedElement, selectedText, documentText, dtoElements),
            elementStates);
    }

    private static bool IsActionable(AutomationElement element, string role)
    {
        try
        {
            var type = element.Current.ControlType;
            if (ActionableTypes.Contains(type)) return true;
            return element.TryGetCurrentPattern(InvokePattern.Pattern, out _)
                || element.TryGetCurrentPattern(ValuePattern.Pattern, out _)
                || element.TryGetCurrentPattern(SelectionItemPattern.Pattern, out _)
                || element.TryGetCurrentPattern(TogglePattern.Pattern, out _);
        }
        catch
        {
            return role is "button" or "link" or "edit";
        }
    }

    private static RectDto? ToRelativeBounds(
        System.Windows.Rect bounds,
        NativeMethods.Rect windowRect,
        int viewportWidth,
        int viewportHeight)
    {
        if (bounds.IsEmpty
            || !double.IsFinite(bounds.X)
            || !double.IsFinite(bounds.Y)
            || bounds.Width <= 0
            || bounds.Height <= 0)
        {
            return null;
        }
        var scaleX = viewportWidth / (double)Math.Max(1, windowRect.Width);
        var scaleY = viewportHeight / (double)Math.Max(1, windowRect.Height);
        var left = (bounds.Left - windowRect.Left) * scaleX;
        var top = (bounds.Top - windowRect.Top) * scaleY;
        var right = (bounds.Right - windowRect.Left) * scaleX;
        var bottom = (bounds.Bottom - windowRect.Top) * scaleY;
        var clippedLeft = Math.Clamp(left, 0, viewportWidth);
        var clippedTop = Math.Clamp(top, 0, viewportHeight);
        var clippedRight = Math.Clamp(right, 0, viewportWidth);
        var clippedBottom = Math.Clamp(bottom, 0, viewportHeight);
        if (clippedRight <= clippedLeft || clippedBottom <= clippedTop) return null;
        return new RectDto(
            Math.Round(clippedLeft, 2),
            Math.Round(clippedTop, 2),
            Math.Round(clippedRight - clippedLeft, 2),
            Math.Round(clippedBottom - clippedTop, 2));
    }

    private static string NormalizeRole(ControlType type)
    {
        var value = type.ProgrammaticName;
        const string prefix = "ControlType.";
        if (value.StartsWith(prefix, StringComparison.Ordinal)) value = value[prefix.Length..];
        return value.ToLowerInvariant();
    }

    private static string Sanitize(string? value, int maxLength)
    {
        if (string.IsNullOrWhiteSpace(value)) return string.Empty;
        var normalized = string.Join(" ", value.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries));
        return normalized.Length <= maxLength ? normalized : normalized[..maxLength] + "…";
    }

    private static string RuntimeIdKey(int[] runtimeId) => string.Join('.', runtimeId);

    private static string? ReadSelectedText(AutomationElement root)
    {
        try
        {
            if (!root.TryGetCurrentPattern(TextPattern.Pattern, out var raw)) return null;
            var ranges = ((TextPattern)raw).GetSelection();
            var value = string.Join(Environment.NewLine, ranges.Select(range => range.GetText(1000))).Trim();
            return value.Length == 0 ? null : Sanitize(value, 2000);
        }
        catch
        {
            return null;
        }
    }

    private static string? ReadDocumentText(AutomationElement root)
    {
        try
        {
            if (!root.TryGetCurrentPattern(TextPattern.Pattern, out var raw)) return null;
            var value = ((TextPattern)raw).DocumentRange.GetText(4000).Trim();
            return value.Length == 0 ? null : value;
        }
        catch
        {
            return null;
        }
    }
}

internal static class InputDispatcher
{
    private static readonly IReadOnlyDictionary<string, ushort> VirtualKeys =
        new Dictionary<string, ushort>(StringComparer.OrdinalIgnoreCase)
        {
            ["BACKSPACE"] = 0x08,
            ["TAB"] = 0x09,
            ["ENTER"] = 0x0D,
            ["SHIFT"] = 0x10,
            ["CTRL"] = 0x11,
            ["CONTROL"] = 0x11,
            ["ALT"] = 0x12,
            ["ESC"] = 0x1B,
            ["ESCAPE"] = 0x1B,
            ["SPACE"] = 0x20,
            ["PAGEUP"] = 0x21,
            ["PAGEDOWN"] = 0x22,
            ["END"] = 0x23,
            ["HOME"] = 0x24,
            ["ARROWLEFT"] = 0x25,
            ["LEFT"] = 0x25,
            ["ARROWUP"] = 0x26,
            ["UP"] = 0x26,
            ["ARROWRIGHT"] = 0x27,
            ["RIGHT"] = 0x27,
            ["ARROWDOWN"] = 0x28,
            ["DOWN"] = 0x28,
            ["INSERT"] = 0x2D,
            ["DELETE"] = 0x2E,
            ["META"] = 0x5B,
            ["WIN"] = 0x5B,
        };

    internal static void Click(int x, int y, string button)
    {
        if (!NativeMethods.SetCursorPos(x, y)) throw new HelperException("ACTION_NOT_SUPPORTED", "cannot position the pointer on the target");
        var (down, up) = button.Equals("right", StringComparison.OrdinalIgnoreCase)
            ? (NativeMethods.MouseeventfRightDown, NativeMethods.MouseeventfRightUp)
            : button.Equals("left", StringComparison.OrdinalIgnoreCase)
                ? (NativeMethods.MouseeventfLeftDown, NativeMethods.MouseeventfLeftUp)
                : throw new HelperException("ACTION_NOT_SUPPORTED", "mouse button must be left or right");
        NativeMethods.Send(Mouse(down), Mouse(up));
    }

    internal static void TypeText(string text, CancellationToken cancellationToken)
    {
        foreach (var character in text)
        {
            cancellationToken.ThrowIfCancellationRequested();
            NativeMethods.Send(
                Keyboard(0, character, NativeMethods.KeyeventfUnicode),
                Keyboard(0, character, NativeMethods.KeyeventfUnicode | NativeMethods.KeyeventfKeyUp));
        }
    }

    internal static void PressKeys(IReadOnlyList<string> keys)
    {
        var virtualKeys = keys.Select(ResolveVirtualKey).ToArray();
        NativeMethods.Send(virtualKeys.Select(key => Keyboard(key, '\0', IsExtended(key) ? NativeMethods.KeyeventfExtendedKey : 0)).ToArray());
        NativeMethods.Send(virtualKeys.Reverse().Select(key => Keyboard(
            key,
            '\0',
            NativeMethods.KeyeventfKeyUp | (IsExtended(key) ? NativeMethods.KeyeventfExtendedKey : 0))).ToArray());
    }

    internal static void Scroll(int x, int y, int deltaX, int deltaY)
    {
        NativeMethods.SetCursorPos(x, y);
        var inputs = new List<NativeMethods.Input>();
        if (deltaY != 0) inputs.Add(Mouse(NativeMethods.MouseeventfWheel, unchecked((uint)-deltaY)));
        if (deltaX != 0) inputs.Add(Mouse(NativeMethods.MouseeventfHWheel, unchecked((uint)deltaX)));
        NativeMethods.Send(inputs.ToArray());
    }

    internal static void Drag(int fromX, int fromY, int toX, int toY, CancellationToken cancellationToken)
    {
        if (!NativeMethods.SetCursorPos(fromX, fromY)) throw new HelperException("ACTION_NOT_SUPPORTED", "cannot position the pointer on the target");
        NativeMethods.Send(Mouse(NativeMethods.MouseeventfLeftDown));
        try
        {
            const int steps = 16;
            for (var step = 1; step <= steps; step++)
            {
                cancellationToken.ThrowIfCancellationRequested();
                var x = fromX + (toX - fromX) * step / steps;
                var y = fromY + (toY - fromY) * step / steps;
                NativeMethods.SetCursorPos(x, y);
                Thread.Sleep(8);
            }
        }
        finally
        {
            NativeMethods.Send(Mouse(NativeMethods.MouseeventfLeftUp));
        }
    }

    private static ushort ResolveVirtualKey(string key)
    {
        var normalized = key.Trim();
        if (VirtualKeys.TryGetValue(normalized, out var known)) return known;
        if (normalized.Length >= 2
            && normalized[0] is 'F' or 'f'
            && int.TryParse(normalized[1..], out var function)
            && function is >= 1 and <= 24)
        {
            return (ushort)(0x6F + function);
        }
        if (normalized.Length == 1)
        {
            var mapped = NativeMethods.VkKeyScanW(normalized[0]);
            if (mapped != -1) return (ushort)(mapped & 0xff);
        }
        throw new HelperException("ACTION_NOT_SUPPORTED", $"unsupported key name: {normalized}");
    }

    private static bool IsExtended(ushort key) => key is 0x21 or 0x22 or 0x23 or 0x24 or 0x25 or 0x26 or 0x27 or 0x28 or 0x2D or 0x2E or 0x5B;

    private static NativeMethods.Input Mouse(uint flags, uint data = 0) => new()
    {
        Type = NativeMethods.InputMouse,
        Data = new NativeMethods.InputUnion
        {
            Mouse = new NativeMethods.MouseInput { Flags = flags, MouseData = data },
        },
    };

    private static NativeMethods.Input Keyboard(ushort virtualKey, char scanCode, uint flags) => new()
    {
        Type = NativeMethods.InputKeyboard,
        Data = new NativeMethods.InputUnion
        {
            Keyboard = new NativeMethods.KeyboardInput
            {
                VirtualKey = virtualKey,
                ScanCode = scanCode,
                Flags = flags,
            },
        },
    };
}

internal sealed class KillSwitch : IDisposable
{
    private readonly object _gate = new();
    private readonly CancellationTokenSource _lifetime = new();
    private readonly Thread _thread;
    private CancellationTokenSource? _armed;
    private bool _escapeWasReleased;

    internal KillSwitch()
    {
        _thread = new Thread(Monitor)
        {
            IsBackground = true,
            Name = "dsh-computer-use-escape-kill-switch",
        };
        _thread.Start();
    }

    internal ArmScope Arm()
    {
        lock (_gate)
        {
            _armed?.Cancel();
            _armed?.Dispose();
            _armed = new CancellationTokenSource();
            _escapeWasReleased = (NativeMethods.GetAsyncKeyState(NativeMethods.VkEscape) & 0x8000) == 0;
            return new ArmScope(this, _armed);
        }
    }

    private void Monitor()
    {
        while (!_lifetime.IsCancellationRequested)
        {
            lock (_gate)
            {
                if (_armed is not null)
                {
                    var pressed = (NativeMethods.GetAsyncKeyState(NativeMethods.VkEscape) & 0x8000) != 0;
                    if (!pressed) _escapeWasReleased = true;
                    else if (_escapeWasReleased) _armed.Cancel();
                }
            }
            Thread.Sleep(10);
        }
    }

    private void Disarm(CancellationTokenSource source)
    {
        lock (_gate)
        {
            if (!ReferenceEquals(_armed, source)) return;
            _armed = null;
            source.Dispose();
        }
    }

    public void Dispose()
    {
        _lifetime.Cancel();
        if (_thread.IsAlive) _thread.Join(250);
        lock (_gate)
        {
            _armed?.Cancel();
            _armed?.Dispose();
            _armed = null;
        }
        _lifetime.Dispose();
    }

    internal sealed class ArmScope(KillSwitch owner, CancellationTokenSource source) : IDisposable
    {
        internal CancellationToken Token => source.Token;
        public void Dispose() => owner.Disarm(source);
    }
}
