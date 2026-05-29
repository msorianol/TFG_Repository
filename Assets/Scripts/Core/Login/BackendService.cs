using System;
using System.Threading;
using System.Threading.Tasks;
using Core.Login;
using PlayFab.ClientModels;
using UnityEngine;
using SystemInfo = UnityEngine.Device.SystemInfo;

public class BackendService
{
    //TODO: create unit tests and extract interface
    //TODO: create a gateway in the middle to decouple the service from PlayFab, so we can easily switch to another backend in the future if needed, update the SDK version, etc

    private readonly ILogin _login;
    private string _currentSessionTicket;

    public BackendService()
    {
        //TODO: implement factory to decide which login method to use based on platform
        _login = new CustomIdLogin();
    }

    public async Task LoginAsync(CancellationToken cancellationToken = default)
    {
        var result =
            await _login.LoginAsync(
                new LoginWithCustomIDRequest { CreateAccount = true, CustomId = SystemInfo.deviceUniqueIdentifier },
                cancellationToken);

        if (result.Item2 != null)
        {
            throw new Exception($"Login failed: {result.Item2.GenerateErrorReport()}");
        }

        if (result.Item1 == null)
        {
            throw new Exception("Login failed: result is null");
        }

        _currentSessionTicket = result.Item1.SessionTicket;
        
        Debug.Log($"Login successful. Is new user? {result.Item1.NewlyCreated}");
    }
}