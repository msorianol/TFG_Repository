using System.Threading;
using System.Threading.Tasks;
using PlayFab;
using PlayFab.ClientModels;

public interface ILogin
{
    //TODO: LoginResult should be a custom class that contains only the data we need, not the entire PlayFab result, otherwise we are tightly coupled to PlayFab in the entire codebase
    //TODO: PlayfabError should be wrapped inside the response for the same reasons as above + ease of use
    //TODO: Request should be generic/polymorphic, not tied to a specific login method, since we may want to support multiple login methods in the future (e.g. email/password, Facebook, Google, etc.)
    //TODO: cancellation token should be properly handled
    public Task<(LoginResult, PlayFabError)> LoginAsync(LoginWithCustomIDRequest request, CancellationToken cancellationToken = default);
}