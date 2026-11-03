#if PICOGK_BROWSER
using System.Runtime.InteropServices.JavaScript;
using System.Text.Json;
using System.Runtime.Versioning;
using PicoGK;

[assembly: SupportedOSPlatform("browser")]

namespace Tau.PicoGK.Worker;

internal static partial class Program
{
    [JSImport("nextRequest", "tau-picogk-host")]
    private static partial Task<string> NextRequest();

    [JSImport("respond", "tau-picogk-host")]
    private static partial void Respond(string frame);

    [JSImport("validateImages", "tau-picogk-host")]
    private static partial Task ValidateImages(string artifactPath, string imageRanges);

    // The JS owner supplies immutable runtime references and a project snapshot before Main.
    // Hard cancellation and source replacement terminate this worker, including its assemblies.
    private static async Task<int> Main(string[] args)
    {
        if (args.Length != 2) throw new ArgumentException("Browser compiler reference list and identity are required.");
        var references = JsonSerializer.Deserialize<string[]>(File.ReadAllText(args[0]))
            ?? throw new ArgumentException("Browser compiler references are required.");
        CompilationService.InitializeBrowser(references, Convert.FromHexString(args[1]));
        var arguments = new Arguments("/project", "/artifacts", 0);
        Directory.CreateDirectory(arguments.Artifacts);
        Directory.CreateDirectory(arguments.Workspace);
        Directory.SetCurrentDirectory(arguments.Workspace);
        Write(new
        {
            protocolVersion = ProtocolVersion,
            type = "ready",
            dotnetVersion = Environment.Version.ToString(),
            picogkVersion = typeof(Library).Assembly.GetName().Version!.ToString(),
        });
        while (true)
        {
            var frame = ParseFrame(await NextRequest());
            if (frame.Oversized || frame.Request is not { } request || request.ProtocolVersion != ProtocolVersion)
                throw new ArgumentException(frame.Error ?? "Invalid PicoGK browser request.");
            try
            {
                if (await Dispatch(request, arguments, CancellationToken.None)) return 0;
            }
            catch (WorkerException error)
            {
                Write(new { protocolVersion = ProtocolVersion, requestId = request.RequestId, error = new { issues = error.Issues } });
            }
            catch (Exception error)
            {
                Write(new
                {
                    protocolVersion = ProtocolVersion,
                    requestId = request.RequestId,
                    error = new { issues = new[] { new Issue(error.Message, "CS_TAU_RUNTIME", "runtime", "error") } },
                });
            }
        }
    }
}
#endif
