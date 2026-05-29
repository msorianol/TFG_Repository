using System.Collections.Generic;
using UnityEngine;
using UnityEngine.SceneManagement;
using R3;
using Core;
using Core.Installers;
using Features.Enemies;
using Features.Projectiles;
using Features.XPSystem;

namespace Features.Player
{
    public class PlayerController : IUpdateableObjects
    {
        private readonly CompositeDisposable _disposables = new();
        private readonly PlayerModel _playerModel;
        private readonly PlayerView _playerView;
        private readonly EnemiesModel _enemiesModel;
        private readonly ProjectileFactory _projectileFactory;
        private readonly XPModel _xpModel;
        
        private float _attackTimer;
        private string _goToSceneName;

        public PlayerController(PlayerModel model, PlayerView view, EnemiesModel enemiesModel,
            ProjectileFactory factory, PlayerDataSO data, XPModel xpModel, string sceneName)
        {
            _playerModel = model;
            _playerView = view;
            _enemiesModel = enemiesModel;
            _projectileFactory = factory;
            _xpModel = xpModel;
            _goToSceneName = sceneName;

            InitializePlayerModel(data);

            _playerView.IsPlayerMoving
                .Subscribe(_ => HandleMovementTick())
                .AddTo(_disposables);
            
            _playerView.OnDamageReceived
                .Subscribe(damage => TakeDamage(damage))
                .AddTo(_disposables);
        }
        
        private void InitializePlayerModel(PlayerDataSO playerData)
        {
            // BASE VALUES
            _playerModel.BaseHealth = playerData.MaxHP;
            _playerModel.BaseDamage = playerData.Damage;
            
            // CURRENT VALUES
            _playerModel.CurrentHealth.Value = _playerModel.BaseHealth;
            _playerModel.CurrentDamage.Value = _playerModel.BaseDamage;
            _playerModel.AttackSpeed.Value = playerData.AttackSpeed;
            _playerModel.MovementSpeed.Value = playerData.MovementSpeed;
            
            ChangePlayerSkin();
        }
        
        public void Update()
        {
            _playerModel.Position.Value = _playerView.transform.position;
        }

        private void HandleMovementTick()
        {
            _attackTimer += Time.deltaTime;

            if (_attackTimer >= _playerModel.AttackSpeed.Value)
            {
                Shoot();
                _attackTimer = 0f;
            }
        }

        private GameObject FindNearestEnemy()
        {
            List<GameObject> enemies = _enemiesModel.GetAliveEnemiesSnapshot();
            if (enemies.Count == 0)
            {
                return null;
            }

            GameObject nearest = null;
            float minDistance = float.MaxValue;

            foreach (GameObject enemy in enemies)
            {
                if (enemy == null)
                {
                    continue;
                }
                
                float distance = Vector3.Distance(_playerView.transform.position, enemy.transform.position);
                
                if (distance < minDistance)
                {
                    minDistance = distance;
                    nearest = enemy;
                }
            }

            return nearest;
        }

        private void Shoot()
        {
            GameObject nearest = FindNearestEnemy();
            if (nearest == null)
            {
                return;
            }

            Vector3 direction = (nearest.transform.position - _playerView.GetShootPointPosition()).normalized;
            Quaternion rotation = Quaternion.LookRotation(direction);
            _projectileFactory.Create(_playerView.GetShootPointPosition(), rotation, _playerModel.CurrentDamage.Value);
        }
        
        private void TakeDamage(float damage)
        {
            _playerModel.CurrentHealth.Value -= damage;

            if (_playerModel.CurrentHealth.Value <= 0)
            {
                int xpGuanyada = _xpModel.TotalAccumulatedXP.Value;
                GeneralInstaller.Instance.GlobalAccountController.OnRunCompleted(xpGuanyada);
                
                SceneManager.LoadScene(_goToSceneName);
            }
        }

        private void ChangePlayerSkin()
        {
            if (PlayerPrefs.HasKey("equipped_skin_color"))
            {
                string hexColor = PlayerPrefs.GetString("equipped_skin_color");
        
                if (ColorUtility.TryParseHtmlString(hexColor, out Color equippedColor))
                {
                    _playerView.ApplySkinColor(equippedColor);
                }
            }
        }

        public void Dispose()
        {
            _disposables.Dispose();
        }
    }
}
