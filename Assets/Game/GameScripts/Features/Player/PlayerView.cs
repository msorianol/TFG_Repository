using UnityEngine;
using R3;
using StarterAssets;

namespace Features.Player
{
    public class PlayerView : MonoBehaviour
    {
        [SerializeField] private StarterAssetsInputs _playerMovement;
        [SerializeField] private Transform _shootPoint;
        [SerializeField] private SkinnedMeshRenderer _skinRenderer;
        
        public Vector3 GetShootPointPosition() => _shootPoint.position;

        private readonly Subject<Unit> _isPlayerMoving = new();
        public Observable<Unit> IsPlayerMoving => _isPlayerMoving;
        
        private readonly Subject<float> _onDamageReceived = new();
        public Observable<float> OnDamageReceived => _onDamageReceived;

        private void Update()
        {
            if (_playerMovement.move == Vector2.zero)
            {
                _isPlayerMoving.OnNext(Unit.Default);
            }
        }
        
        public void TakeDamage(float damage)
        {
            _onDamageReceived.OnNext(damage);
        }
        
        public void ApplySkinColor(Color color)
        {
            if (_skinRenderer == null)
            {
                Debug.LogWarning("[PlayerView] No has assignat el SkinnedMeshRenderer a l'Inspector!");
                return;
            }
            
            foreach (var mat in _skinRenderer.materials) 
            {
                if (mat.HasProperty("_BaseColor"))
                {
                    mat.SetColor("_BaseColor", color);
                }
                else if (mat.HasProperty("_Color"))
                {
                    mat.SetColor("_Color", color);
                }
            }
        }
    }
}