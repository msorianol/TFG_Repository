using System;
using UnityEngine.SceneManagement;
using R3;

namespace Features.MainMenu
{
    public class MainMenuController : IDisposable
    {
        private readonly CompositeDisposable _disposables = new();
        private readonly MainMenuModel _mainMenuModel;
        private readonly MainMenuView _mainMenuView;
        
        public MainMenuController(MainMenuModel model, MainMenuView view)
        {
            _mainMenuModel = model;
            _mainMenuView = view;

            _mainMenuView.OnPlayClicked
                .Subscribe(_ => LoadScene(_mainMenuModel.GameplaySceneName))
                .AddTo(_disposables); 
            
            _mainMenuView.OnShopClicked
                .Subscribe(_ => LoadScene(_mainMenuModel.ShopSceneName))
                .AddTo(_disposables);

            _mainMenuView.OnExitClicked
                .Subscribe(_ => ExitGame())
                .AddTo(_disposables);
        }

        private void LoadScene(string scene)
        {
            if (!string.IsNullOrEmpty(scene))
            {
                SceneManager.LoadScene(scene);
            }
        }

        private void ExitGame()
        {
        #if UNITY_EDITOR
            UnityEditor.EditorApplication.isPlaying = false;
        #else
        Application.Quit();
        #endif
        }

        public void Dispose()
        {
            _disposables.Dispose();
        }
    }
}