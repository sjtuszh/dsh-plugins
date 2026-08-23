using System.IO;
using System.IO.Pipes;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace DshComputerUseHelper;

internal static class Program
{
    private const int ProtocolVersion = 1;
    private const int MaxFrameBytes = 8 * 1024 * 1024;

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    [MTAThread]
    private static int Main(string[] args)
    {
        NativeMethods.TryEnablePerMonitorDpiAwareness();
        NativeMethods.InitializeWindowsRuntime();
        TempScreenshotStore.DeleteAbandonedFiles();

        try
        {
            using var server = new WindowsComputerUseServer();
            if (TryGetPipeName(args, out var pipeName))
            {
                using var pipe = new NamedPipeServerStream(
                    pipeName,
                    PipeDirection.InOut,
                    1,
                    PipeTransmissionMode.Byte,
                    PipeOptions.Asynchronous | PipeOptions.CurrentUserOnly);
                Console.Error.WriteLine($"[dsh-computer-use] waiting on pipe {pipeName}");
                pipe.WaitForConnection();
                HandleConnection(pipe, pipe, server);
            }
            else
            {
                // The TypeScript PipeConnection launches the helper with piped
                // stdin/stdout. Diagnostics must therefore stay on stderr.
                using var input = Console.OpenStandardInput();
                using var output = Console.OpenStandardOutput();
                HandleConnection(input, output, server);
            }
            return 0;
        }
        catch (Exception error)
        {
            Console.Error.WriteLine($"[dsh-computer-use] fatal: {error.GetType().Name}: {error.Message}");
            return 1;
        }
        finally
        {
            NativeMethods.UninitializeWindowsRuntime();
        }
    }

    private static void HandleConnection(Stream input, Stream output, WindowsComputerUseServer server)
    {
        var handshaken = false;
        while (true)
        {
            byte[]? frame = ReadFrame(input);
            if (frame is null) return;

            long id = -1;
            object response;
            var shouldClose = false;
            try
            {
                using var document = JsonDocument.Parse(frame);
                var root = document.RootElement;
                id = root.GetProperty("id").GetInt64();
                var method = root.GetProperty("method").GetString()
                    ?? throw new JsonException("method must be a string");
                var parameters = root.TryGetProperty("params", out var value)
                    ? value
                    : default;

                if (!handshaken && method != "handshake")
                {
                    throw new HelperException("PROTOCOL_MISMATCH", "handshake must be the first request");
                }

                object result;
                if (method == "handshake")
                {
                    var version = parameters.GetProperty("protocolVersion").GetInt32();
                    if (version != ProtocolVersion)
                    {
                        throw new HelperException("PROTOCOL_MISMATCH", "unsupported protocol version");
                    }
                    handshaken = true;
                    if (parameters.TryGetProperty("windowState", out var windowState))
                    {
                        server.SetWindowState(windowState.GetString());
                    }
                    result = new { helperVersion = "0.1.0", protocolVersion = ProtocolVersion };
                }
                else if (method == "ping")
                {
                    result = new { };
                }
                else if (method == "close")
                {
                    result = new { };
                    shouldClose = true;
                }
                else
                {
                    result = server.Dispatch(method, parameters);
                }
                response = new { id, ok = true, result };
            }
            catch (HelperException error)
            {
                response = Error(id, error.Code, error.Message);
            }
            catch (OperationCanceledException)
            {
                response = Error(id, "USER_INTERRUPTED", "the physical Escape kill switch interrupted the action");
            }
            catch (JsonException)
            {
                response = Error(id, "PROTOCOL_MISMATCH", "malformed request payload");
            }
            catch (Exception error)
            {
                Console.Error.WriteLine($"[dsh-computer-use] request failed: {error.GetType().Name}: {error.Message}");
                response = Error(id, "PROVIDER_CRASHED", "native Windows operation failed");
            }

            WriteFrame(output, JsonSerializer.SerializeToUtf8Bytes(response, response.GetType(), JsonOptions));
            if (shouldClose) return;
        }
    }

    private static object Error(long id, string code, string message) =>
        new { id, ok = false, error = new { code, message } };

    private static byte[]? ReadFrame(Stream stream)
    {
        var header = new byte[4];
        if (!ReadExactlyOrEof(stream, header)) return null;
        var length = BitConverter.ToUInt32(header, 0);
        if (length > MaxFrameBytes)
        {
            throw new InvalidDataException($"frame too large: {length}");
        }
        var body = new byte[(int)length];
        return ReadExactlyOrEof(stream, body) ? body : null;
    }

    private static bool ReadExactlyOrEof(Stream stream, byte[] buffer)
    {
        var offset = 0;
        while (offset < buffer.Length)
        {
            var read = stream.Read(buffer, offset, buffer.Length - offset);
            if (read <= 0) return false;
            offset += read;
        }
        return true;
    }

    private static void WriteFrame(Stream stream, byte[] payload)
    {
        if (payload.Length > MaxFrameBytes)
        {
            throw new InvalidDataException($"response frame too large: {payload.Length}");
        }
        Span<byte> header = stackalloc byte[4];
        BitConverter.TryWriteBytes(header, (uint)payload.Length);
        stream.Write(header);
        stream.Write(payload);
        stream.Flush();
    }

    private static bool TryGetPipeName(string[] args, out string pipeName)
    {
        pipeName = string.Empty;
        if (args.Length >= 2 && args[0].Equals("--pipe", StringComparison.OrdinalIgnoreCase))
        {
            pipeName = args[1];
            return true;
        }
        // Backwards compatibility with the first skeleton, whose sole
        // positional argument was a pipe name.
        if (args.Length == 1 && !args[0].Equals("--stdio", StringComparison.OrdinalIgnoreCase))
        {
            pipeName = args[0];
            return true;
        }
        return false;
    }
}

internal sealed class HelperException(string code, string message) : Exception(message)
{
    public string Code { get; } = code;
}
