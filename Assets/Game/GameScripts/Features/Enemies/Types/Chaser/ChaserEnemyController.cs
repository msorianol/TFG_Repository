using UnityEngine;
using R3;
using Core;
using Features.Player;

namespace Features.Enemies.Types.Chaser
{
    public class ChaserEnemyController : IEnemyBehaviour
    {
        private readonly CompositeDisposable _disposables = new();
        private readonly ChaserEnemyView _view;
        private readonly PlayerModel _playerModel;
        private readonly float _speed;
        private readonly IUpdateLoop _updateLoop;
        
        public ChaserEnemyController(ChaserEnemyView view, PlayerModel playerModel, PlayerView playerView, float speed,
            IUpdateLoop updateLoop)
        {
            _view = view;
            _playerModel = playerModel;
            _speed = speed;
            _updateLoop = updateLoop;
            
            _updateLoop.RegisterUpdateable(this);
            
            view.OnPlayerHit
                .Subscribe(damage => playerView.TakeDamage(damage))
                .AddTo(_disposables);
        }

        public void Update()
        {
            if (_view == null)
            {
                Dispose();
                return;
            }
            
            Vector3 direction = (_playerModel.Position.Value - _view.transform.position).normalized;
            _view.Move(direction, _speed);
        }

        public void Dispose()
        {
            _disposables.Dispose();
            _updateLoop.UnregisterUpdateable(this);
        }
    }
}
