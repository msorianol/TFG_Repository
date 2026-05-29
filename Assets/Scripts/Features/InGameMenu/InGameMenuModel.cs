using R3;

namespace Features.InGameMenu
{
    public class InGameMenuModel
    {
        public ReactiveProperty<bool> IsGameRunning { get; private set; } = new(true);
        public ReactiveProperty<string> GoToSceneName { get; private set; }

        public InGameMenuModel(string sceneName)
        {
            GoToSceneName = new ReactiveProperty<string>(sceneName);
        }
    }
}