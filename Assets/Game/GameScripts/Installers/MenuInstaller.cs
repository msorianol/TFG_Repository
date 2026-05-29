using UnityEngine;
using Features.MainMenu;

namespace Core.Installers
{
    public class MenuInstaller : MonoBehaviour
    {
        [Header("General")]
        [SerializeField] private MainMenuView _mainMenuView;
        private MainMenuController _mainMenuController;
        private MainMenuModel _mainMenuModel;
    
        [Header("Gameplay Scene")]
        [SerializeField] private Object _gameplayScene;
        
        [Header("Shop Scene")]
        [SerializeField] private Object _shopScene;

        void Start()
        {
            string gameplaySceneName = _gameplayScene != null ? _gameplayScene.name : "";
            string shopSceneName = _shopScene != null ? _shopScene.name : "";
            
            _mainMenuModel = new MainMenuModel(gameplaySceneName, shopSceneName);
            
            _mainMenuController = new MainMenuController(_mainMenuModel, _mainMenuView);
        }
    
        private void OnDestroy()
        {
            _mainMenuController?.Dispose();
        }
    }
}