using System;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace Core
{
    /// <summary>
    /// This is the entry point of the game. It initializes key systems, installers in the correct order, etc
    /// </summary>
    public class Bootstrap : MonoBehaviour
    {
        private const string MainMenuScene = "MainMenu";
        
        private async void Awake()
        {
            try
            {
                var backendService = new BackendService();
                await backendService.LoginAsync();
                
                
                SceneManager.LoadScene(MainMenuScene);
            }
            catch (Exception e)
            {
                //TODO: ideally retry
                Debug.LogError($"Game initialisation failed: {e}");
            }
        }
    }
}