using UnityEngine;
using Core;
using Core.Installers;
using Features.Player;
using StarterAssets;
using Features.XPSystem;
using Features.Upgrades;
using Features.Levels.Levels;
using Features.Levels.Runs;
using Features.Enemies;
using Features.Projectiles;
using Features.InGameMenu;
using Features.Upgrades.Types.Damage;
using Features.Upgrades.Types.Health;
using TFG;

namespace Installers
{
    public class GameplayInstaller : MonoBehaviour
    {
        [Header("Views")] 
        [SerializeField] private PlayerView _playerView;
        [SerializeField] private XPView _xpView;
        [SerializeField] private UpgradesView _upgradesView;
        [SerializeField] private RunView _runView;
        [SerializeField] private LevelView _levelView;
        [SerializeField] private EnemySpawnerView enemySpawnerView;
        [SerializeField] private InGameMenuView _inGameMenuView;

        private PlayerController _playerController;
        private XPController _xpController;
        private RunController _runController;
        private LevelController _levelController;
        private EnemiesController _enemiesController;
        private InGameMenuController _inGameMenuController;
        private UpgradesController _upgradesController;
        private DamageUpgradeController _damageUpgradeController;
        private HealthUpgradeController _healthUpgradeController;

        private PlayerModel _playerModel;
        private XPModel _xpModel;
        private UpgradesModel _upgradesModel;
        private RunModel _runModel;
        private LevelModel _levelModel;
        private EnemiesModel _enemiesModel;
        private InGameMenuModel _inGameMenuModel;
        private IUpdateLoop _updateLoop;

        [Header("Player Data")] 
        [SerializeField] private ThirdPersonController _thirdPersonController;
        [SerializeField] private PlayerDataSO _playerData;

        [Header("Projectile Prefab")] 
        [SerializeField] private ProjectileView _baseProjectilePrefab;

        [Header("Upgrades Data")] 
        [SerializeField] private UpgradeDataSO[] _upgradesData;
        
        [Header("Run Data")] 
        [SerializeField] private RunDataSO _runData;

        [Header("Main Menu Scene")] 
        [SerializeField] private Object _mainMenuScene;

        private CRM_Bridge _crmBridge;

        private void Start()
        {
            _updateLoop = FindObjectOfType<GeneralInstaller>();
            if (_updateLoop == null)
            {
                Debug.LogError("GeneralInstaller not found. Gameplay systems requiring update loop will not initialize.");
                enabled = false;
                return;
            }
            
            string sceneName = _mainMenuScene != null ? _mainMenuScene.name : "";

            _enemiesModel = new EnemiesModel();
            _playerModel = new PlayerModel();
            
            _xpModel =  new XPModel();
            _xpController = new XPController(_xpModel, _xpView, _enemiesModel);
            
            var globalAccountModel = GeneralInstaller.Instance.GlobalAccountModel;
            _crmBridge = new CRM_Bridge(globalAccountModel, _playerData);
            
            var projectileFactory = new ProjectileFactory(_baseProjectilePrefab);
            var enemyBehaviourFactory = new EnemyBehaviourFactory(_playerModel, enemySpawnerView, _updateLoop);

            _playerController = new PlayerController(_playerModel, _playerView, _enemiesModel, projectileFactory,
                _playerData, _xpModel, sceneName);
            _updateLoop.RegisterUpdateable(_playerController);
            
            _upgradesModel = new UpgradesModel();
            _upgradesController = new UpgradesController(_upgradesModel, _upgradesView, _xpModel, 
                _upgradesData);
            
            _damageUpgradeController = new DamageUpgradeController(_upgradesModel.DamageUpgrade, _playerModel);
            _healthUpgradeController = new HealthUpgradeController(_upgradesModel.HealthUpgrade, _playerModel);
            
            _levelModel = new LevelModel();
            _levelController = new LevelController(_levelModel, _levelView, _enemiesModel);

            _enemiesController = new EnemiesController(_enemiesModel, _playerView, _levelModel,
                enemyBehaviourFactory);

            _runModel = new RunModel(_runData, sceneName);
            _runController = new RunController(_runModel, _runView, _levelModel, _levelView, 
                _thirdPersonController, _xpModel);

            _inGameMenuModel = new InGameMenuModel(sceneName);
            _inGameMenuController = new InGameMenuController(_inGameMenuModel, _inGameMenuView);
            _updateLoop.RegisterUpdateable(_inGameMenuController);
        }

        private void OnDestroy()
        {
            _xpController?.Dispose();
            _upgradesController?.Dispose();
            _damageUpgradeController?.Dispose();
            _healthUpgradeController?.Dispose();
            _runController?.Dispose();
            _levelController?.Dispose();
            _enemiesController?.Dispose();
            
            if (_updateLoop != null)
            {
                _updateLoop.UnregisterUpdateable(_playerController);
                _updateLoop.UnregisterUpdateable(_inGameMenuController);
            }
            
            _playerController?.Dispose();
            _inGameMenuController?.Dispose();
            _crmBridge?.Dispose();
        }
    }
}
