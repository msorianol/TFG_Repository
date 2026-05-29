using R3;
using UnityEngine;

namespace Features.Player
{
    public class PlayerModel
    {
        public float BaseDamage { get; set; } = 0f;
        public float BaseHealth { get; set; } = 0f;
        
        public ReactiveProperty<float> CurrentHealth { get; private set; } = new(0f);
        public ReactiveProperty<float> CurrentDamage { get; private set; } = new(0f);
        public ReactiveProperty<float> AttackSpeed { get; private set; } = new(0f);
        public ReactiveProperty<float> MovementSpeed { get; private set; } = new(0f);
        public ReactiveProperty<Vector3> Position { get; } = new(Vector3.zero);
    }
}