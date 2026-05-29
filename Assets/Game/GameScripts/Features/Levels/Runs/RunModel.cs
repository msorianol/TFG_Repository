using R3;

namespace Features.Levels.Runs
{
    public class RunModel
    {
        public ReactiveProperty<int> CurrentLevelIndex { get; } = new(0);
        public ReactiveProperty<int> MaxLevelsInRun { get; } = new(0);
        public ReactiveProperty<string> GoToSceneName { get; private set; }
        public RunDataSO RunData { get; private set; }
        
        public RunModel(RunDataSO runData, string sceneName)
        {
            RunData = runData;
            
            if (RunData != null && RunData.LevelPrefabs != null)
            {
                MaxLevelsInRun.Value = RunData.LevelPrefabs.Count;
            }
            
            GoToSceneName = new ReactiveProperty<string>(sceneName);
        }
    }
}