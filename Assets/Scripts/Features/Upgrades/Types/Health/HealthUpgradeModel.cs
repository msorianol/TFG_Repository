using R3;

namespace Features.Upgrades.Types.Health
{
    public class HealthUpgradeModel
    {
        public float OriginalBaseHealth { get; set; }
        public ReactiveProperty<float> TotalModifierPercent { get; } = new(0f);
    }
}