using R3;

namespace Features.Upgrades.Types.Damage
{
    public class DamageUpgradeModel
    {
        public ReactiveProperty<float> TotalModifierPercent { get; } = new(0f);
    }
}