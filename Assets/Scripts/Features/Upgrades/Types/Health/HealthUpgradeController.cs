using System;
using UnityEngine;
using R3;
using Features.Player;

namespace Features.Upgrades.Types.Health
{
    public class HealthUpgradeController : IDisposable
    {
        private readonly CompositeDisposable _disposables = new();
        private readonly HealthUpgradeModel _model;
        private readonly PlayerModel _playerModel;

        public HealthUpgradeController(HealthUpgradeModel model, PlayerModel playerModel)
        {
            _model = model;
            _playerModel = playerModel;

            Init();
        }

        private void Init()
        {
            _model.OriginalBaseHealth = _playerModel.BaseHealth;
            
            _model.TotalModifierPercent
                .Subscribe(_ => Modify())
                .AddTo(_disposables);
        }

        private void Modify()
        {
            _playerModel.BaseHealth = 
                _model.OriginalBaseHealth * (1f + _model.TotalModifierPercent.Value / 100f);
            
            Debug.Log("[UPGRADES] New MAX health is: " + _playerModel.BaseHealth +
                      " | CURRENT health is: " + _playerModel.CurrentHealth.Value);
        }

        public void Dispose()
        {
            _disposables.Dispose();
        }
    }
}