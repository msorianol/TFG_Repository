using UnityEngine;

namespace Features.Player
{
    [CreateAssetMenu(fileName = "PlayerData", menuName = "Game/Player Data")]
    public class PlayerDataSO : ScriptableObject
    {
        public float MaxHP;
        public float MovementSpeed;
        public float AttackSpeed;
        public float Damage;
    }
}