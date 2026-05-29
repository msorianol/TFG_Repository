using System;
using UnityEngine;
using R3;
using Features.Player;

namespace Features.Upgrades.Types.Damage
{
    public class DamageUpgradeController : IDisposable
    {
        private readonly CompositeDisposable _disposables = new();
        private readonly DamageUpgradeModel _model;
        private readonly PlayerModel _playerModel;

        public DamageUpgradeController(DamageUpgradeModel model, PlayerModel playerModel)
        {
            _model = model;
            _playerModel = playerModel;

            Init();
        }

        private void Init()
        {
            _model.TotalModifierPercent
                .Subscribe(_ => Modify())
                .AddTo(_disposables);
        }

        private void Modify()
        {
            _playerModel.CurrentDamage.Value =
                _playerModel.BaseDamage * (1f + _model.TotalModifierPercent.Value / 100f);

            Debug.Log("[UPGRADES] The BASE damage is: " + _playerModel.BaseDamage + "  | CURRENT damage is: " +
                      _playerModel.CurrentDamage);
        }

        public void Dispose()
        {
            _disposables.Dispose();
        }
    }
}