using R3;

namespace Features.XPSystem
{
    public class XPModel
    {
        public ReactiveProperty<int> CurrentXP { get; } = new(0);
        public ReactiveProperty<int> CurrentLevel { get; } = new(1);
        public ReactiveProperty<int> XPToNextLevel { get; } = new(100);
        public ReactiveProperty<int> TotalAccumulatedXP { get; } = new(0);
        public Subject<int> OnLevelUp { get; } = new();
    }
}