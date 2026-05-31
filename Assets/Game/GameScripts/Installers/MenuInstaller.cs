using Features.MainMenu;
using Game.GameScripts.Features.MainMenu;
using UnityEngine;

namespace Game.GameScripts.Installers
{
    public class MenuInstaller : MonoBehaviour
    {
        [Header("General")]
        [SerializeField] private MainMenuView _mainMenuView;
        private MainMenuController _mainMenuController;
        private MainMenuModel _mainMenuModel;
    
        [Header("Gameplay Scene")]
        [SerializeField] private string _gameplaySceneName;
        
        [Header("Shop Scene")]
        [SerializeField] private string _shopSceneName;

        void Start()
        {
            _mainMenuModel = new MainMenuModel(_gameplaySceneName, _shopSceneName);
            
            _mainMenuController = new MainMenuController(_mainMenuModel, _mainMenuView);
        }
    
        private void OnDestroy()
        {
            _mainMenuController?.Dispose();
        }
    }
}