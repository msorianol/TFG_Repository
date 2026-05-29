using UnityEngine;

namespace Features.Upgrades
{
    [CreateAssetMenu(fileName = "NewUpgrade", menuName = "Game/Upgrade Data")]
    public class UpgradeDataSO : ScriptableObject
    {
        public string UpgradeName;
        public string Description;
        public Sprite Icon;
        public UpgradeType Type;
        public float Value;
    }
}