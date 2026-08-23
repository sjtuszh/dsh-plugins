using System.IO;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using Windows.Graphics.Capture;
using Windows.Graphics.DirectX;
using Windows.Graphics.DirectX.Direct3D11;
using Windows.Graphics.Imaging;
using Windows.Storage.Streams;
using WinRT;

namespace DshComputerUseHelper;

internal sealed record NativeScreenshot(
    string ScreenshotId,
    int Width,
    int Height,
    string FilePath,
    string Sha256,
    long Bytes,
    string MediaType = "image/png");

internal static class WgcCapture
{
    private const uint D3dDriverTypeHardware = 1;
    private const uint D3dDriverTypeWarp = 5;
    private const uint D3d11CreateDeviceBgraSupport = 0x20;
    private const uint D3d11SdkVersion = 7;
    private static readonly Guid IdxgiDevice = new("54EC77FA-1377-44E6-8C32-88FD5F44C84C");
    private static readonly Guid GraphicsCaptureItemGuid = new("79C3F95B-31F7-4EC2-A464-632EF5D30760");

    [ComImport]
    [Guid("3628E81B-3CAC-4C60-B7F4-23CE0E0C3356")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    [ComVisible(true)]
    private interface IGraphicsCaptureItemInterop
    {
        IntPtr CreateForWindow(IntPtr window, in Guid iid);
        IntPtr CreateForMonitor(IntPtr monitor, in Guid iid);
    }

    [DllImport("d3d11.dll", CallingConvention = CallingConvention.StdCall)]
    private static extern int D3D11CreateDevice(
        IntPtr adapter,
        uint driverType,
        IntPtr software,
        uint flags,
        IntPtr featureLevels,
        uint featureLevelCount,
        uint sdkVersion,
        out IntPtr device,
        out uint featureLevel,
        out IntPtr immediateContext);

    [DllImport("d3d11.dll", CallingConvention = CallingConvention.StdCall)]
    private static extern int CreateDirect3D11DeviceFromDXGIDevice(
        IntPtr dxgiDevice,
        out IntPtr graphicsDevice);

    internal static NativeScreenshot CaptureWindow(
        IntPtr hwnd,
        string screenshotId,
        CancellationToken cancellationToken)
    {
        if (!GraphicsCaptureSession.IsSupported())
        {
            throw new HelperException("ACTION_NOT_SUPPORTED", "Windows Graphics Capture is not supported on this system");
        }
        if (NativeMethods.IsIconic(hwnd))
        {
            throw new HelperException("TARGET_CHANGED", "minimized windows cannot be captured; restore the window first");
        }
        return CaptureWindowAsync(hwnd, screenshotId, cancellationToken).GetAwaiter().GetResult();
    }

    private static async Task<NativeScreenshot> CaptureWindowAsync(
        IntPtr hwnd,
        string screenshotId,
        CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var item = CreateItemForWindow(hwnd);
        if (item.Size.Width <= 0 || item.Size.Height <= 0)
        {
            throw new HelperException("TARGET_CHANGED", "window has no capturable surface");
        }

        var device = CreateDirect3DDevice();
        try
        {
            using var framePool = Direct3D11CaptureFramePool.CreateFreeThreaded(
                device,
                DirectXPixelFormat.B8G8R8A8UIntNormalized,
                1,
                item.Size);
            using var session = framePool.CreateCaptureSession(item);
            var frameReady = new TaskCompletionSource<Direct3D11CaptureFrame>(TaskCreationOptions.RunContinuationsAsynchronously);

            Windows.Foundation.TypedEventHandler<Direct3D11CaptureFramePool, object>? handler = null;
            handler = (sender, _) =>
            {
                try
                {
                    var frame = sender.TryGetNextFrame();
                    if (!frameReady.TrySetResult(frame)) frame.Dispose();
                }
                catch (Exception error)
                {
                    frameReady.TrySetException(error);
                }
            };
            framePool.FrameArrived += handler;
            try
            {
                session.StartCapture();
                using var frame = await frameReady.Task.WaitAsync(TimeSpan.FromSeconds(5), cancellationToken);
                cancellationToken.ThrowIfCancellationRequested();

                using var bitmap = await SoftwareBitmap.CreateCopyFromSurfaceAsync(frame.Surface);
                var png = await EncodePngAsync(bitmap, cancellationToken);
                var path = TempScreenshotStore.CreatePath();
                await File.WriteAllBytesAsync(path, png, cancellationToken);
                var hash = Convert.ToHexString(SHA256.HashData(png)).ToLowerInvariant();
                return new NativeScreenshot(
                    screenshotId,
                    bitmap.PixelWidth,
                    bitmap.PixelHeight,
                    path,
                    hash,
                    png.LongLength);
            }
            finally
            {
                framePool.FrameArrived -= handler;
            }
        }
        finally
        {
            if (device is IDisposable disposable) disposable.Dispose();
        }
    }

    private static GraphicsCaptureItem CreateItemForWindow(IntPtr hwnd)
    {
        var interop = GraphicsCaptureItem.As<IGraphicsCaptureItemInterop>();
        var pointer = interop.CreateForWindow(hwnd, GraphicsCaptureItemGuid);
        if (pointer == IntPtr.Zero)
        {
            throw new HelperException("TARGET_CHANGED", "Windows Graphics Capture rejected the target window");
        }
        try
        {
            return GraphicsCaptureItem.FromAbi(pointer);
        }
        finally
        {
            Marshal.Release(pointer);
        }
    }

    private static IDirect3DDevice CreateDirect3DDevice()
    {
        var result = CreateNativeD3dDevice(D3dDriverTypeHardware, out var nativeDevice, out var context);
        if (result < 0)
        {
            result = CreateNativeD3dDevice(D3dDriverTypeWarp, out nativeDevice, out context);
        }
        Marshal.ThrowExceptionForHR(result);

        IntPtr dxgiDevice = IntPtr.Zero;
        IntPtr graphicsDevice = IntPtr.Zero;
        try
        {
            var iid = IdxgiDevice;
            Marshal.ThrowExceptionForHR(Marshal.QueryInterface(nativeDevice, in iid, out dxgiDevice));
            Marshal.ThrowExceptionForHR(CreateDirect3D11DeviceFromDXGIDevice(dxgiDevice, out graphicsDevice));
            return MarshalInterface<IDirect3DDevice>.FromAbi(graphicsDevice);
        }
        finally
        {
            if (graphicsDevice != IntPtr.Zero) Marshal.Release(graphicsDevice);
            if (dxgiDevice != IntPtr.Zero) Marshal.Release(dxgiDevice);
            if (context != IntPtr.Zero) Marshal.Release(context);
            if (nativeDevice != IntPtr.Zero) Marshal.Release(nativeDevice);
        }
    }

    private static int CreateNativeD3dDevice(uint driverType, out IntPtr device, out IntPtr context)
    {
        return D3D11CreateDevice(
            IntPtr.Zero,
            driverType,
            IntPtr.Zero,
            D3d11CreateDeviceBgraSupport,
            IntPtr.Zero,
            0,
            D3d11SdkVersion,
            out device,
            out _,
            out context);
    }

    private static async Task<byte[]> EncodePngAsync(SoftwareBitmap bitmap, CancellationToken cancellationToken)
    {
        using var stream = new InMemoryRandomAccessStream();
        var encoder = await BitmapEncoder.CreateAsync(BitmapEncoder.PngEncoderId, stream);
        encoder.SetSoftwareBitmap(bitmap);
        await encoder.FlushAsync();
        cancellationToken.ThrowIfCancellationRequested();

        if (stream.Size > int.MaxValue)
        {
            throw new HelperException("PROVIDER_CRASHED", "captured image is too large");
        }
        stream.Seek(0);
        using var reader = new DataReader(stream.GetInputStreamAt(0));
        await reader.LoadAsync((uint)stream.Size);
        var bytes = new byte[(int)stream.Size];
        reader.ReadBytes(bytes);
        return bytes;
    }
}

internal static class TempScreenshotStore
{
    private const string Prefix = "dsh-computer-use-";

    internal static string CreatePath() =>
        Path.Combine(Path.GetTempPath(), $"{Prefix}{Environment.ProcessId}-{Guid.NewGuid():N}.png");

    internal static void DeleteAbandonedFiles()
    {
        try
        {
            var cutoff = DateTime.UtcNow.AddMinutes(-15);
            foreach (var path in Directory.EnumerateFiles(Path.GetTempPath(), $"{Prefix}*.png"))
            {
                try
                {
                    if (File.GetLastWriteTimeUtc(path) < cutoff) File.Delete(path);
                }
                catch
                {
                    // A live helper may still own it; TTL cleanup is best effort.
                }
            }
        }
        catch
        {
            // A locked-down temp directory should not prevent helper startup.
        }
    }

    internal static void Delete(string? path)
    {
        if (string.IsNullOrWhiteSpace(path)) return;
        try
        {
            var fullPath = Path.GetFullPath(path);
            var tempRoot = Path.GetFullPath(Path.GetTempPath());
            if (fullPath.StartsWith(tempRoot, StringComparison.OrdinalIgnoreCase)
                && Path.GetFileName(fullPath).StartsWith(Prefix, StringComparison.OrdinalIgnoreCase))
            {
                File.Delete(fullPath);
            }
        }
        catch
        {
            // The TypeScript side normally deletes immediately after ingest.
        }
    }
}
