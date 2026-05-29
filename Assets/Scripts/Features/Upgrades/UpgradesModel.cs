using R3;
using Features.Player;
using Features.Upgrades.Types.Damage;
using Features.Upgrades.Types.Health;

namespace Features.Upgrades
{
    public class UpgradesModel
    {
        public ReactiveProperty<UpgradeDataSO[]> CurrentChoices { get; } = new(null);
        
        public DamageUpgradeModel DamageUpgrade { get; } = new();
        public HealthUpgradeModel HealthUpgrade { get; } = new();
    }
}