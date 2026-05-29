using System.Collections.Generic;
using UnityEngine;

[CreateAssetMenu(fileName = "NewRun", menuName = "Game/Run Data")]
public class RunDataSO : ScriptableObject
{
    public string RunName;
    public List<GameObject> LevelPrefabs;
}