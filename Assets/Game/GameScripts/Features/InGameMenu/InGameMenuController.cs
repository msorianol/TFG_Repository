using System;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.SceneManagement;
using R3;
using Core;

namespace Features.InGameMenu
{
    public class InGameMenuController : IDisposable, IUpdateableObjects
    {
        private readonly CompositeDisposable _disposables = new();
        private readonly InGameMenuModel _inGameMenuModel;
        private readonly InGameMenuView _inGameMenuView;
    
        public InGameMenuController(InGameMenuModel model, InGameMenuView view)
        {
            _inGameMenuModel = model;
            _inGameMenuView = view;
        
            _inGameMenuView.PauseClicked
                .Subscribe(_ => PauseGame(true))
                .AddTo(_disposables);
            
            _inGameMenuView.ReturnToMenuClicked
                .Subscribe(_ => GoToMainMenu())
                .AddTo(_disposables);
        }
    
        public void Update()
        {
            if (Keyboard.current != null && Keyboard.current.escapeKey.wasPressedThisFrame && _inGameMenuModel.IsGameRunning.Value)
            {
                PauseGame(true);
            }
            else if (Keyboard.current != null && Keyboard.current.escapeKey.wasPressedThisFrame && !_inGameMenuModel.IsGameRunning.Value)
            {
                PauseGame(false);
            }
        }

        private void GoToMainMenu()
        {
            Time.timeScale = 1f;
            _inGameMenuModel.IsGameRunning.Value = true;
            
            string scene = _inGameMenuModel.GoToSceneName.Value;
            if (!string.IsNullOrEmpty(scene))
            {
                SceneManager.LoadScene(scene);
            }
        }
    
        private void PauseGame(bool pause)
        {
            if (pause)
            {
                Time.timeScale = 0f;
                _inGameMenuModel.IsGameRunning.Value = false;
                _inGameMenuView.ChangeButtonState(true);
            }
            else
            {
                Time.timeScale = 1f;
                _inGameMenuModel.IsGameRunning.Value = true;
                _inGameMenuView.ChangeButtonState(false);
            }
        }

        public void Dispose()
        {
            _disposables.Dispose();
        }
    }
}