using R3;

namespace Features.MainMenu
{
    public class MainMenuModel
    {
        public string GameplaySceneName { get; private set; }
        public string ShopSceneName { get; private set; }

        public MainMenuModel(string gameplayScene, string shopScene)
        {
            GameplaySceneName = gameplayScene;
            ShopSceneName = shopScene;
        }
    }
}