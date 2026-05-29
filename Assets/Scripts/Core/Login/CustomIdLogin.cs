using System.Threading;
using System.Threading.Tasks;
using PlayFab;
using PlayFab.ClientModels;

namespace Core.Login
{
    public class CustomIdLogin : ILogin
    {
        public async Task<(LoginResult, PlayFabError)> LoginAsync(LoginWithCustomIDRequest request, CancellationToken cancellationToken = default)
        {
            TaskCompletionSource<(LoginResult, PlayFabError)> tcs = new TaskCompletionSource<(LoginResult, PlayFabError)>();
            cancellationToken.Register(() => tcs.TrySetCanceled());
        
            PlayFabClientAPI.LoginWithCustomID(request,
                result =>
                {
                    tcs.TrySetResult((result, null));
                }, error =>
                {
                    tcs.TrySetResult((null, error));
                });

            var result = await tcs.Task;
        
            return result;
        }
    }
}