using System.Collections.Generic;
using UnityEngine;
using TFG.Scripts.Server;
using TFG.Scripts.Server.Data;

namespace TFG.Scripts.Decoration
{
    public class DecorationController : MonoBehaviour
    {
        [Header("DECORATIONS IN THE SCENE")]
        [SerializeField] private List<DecorationData> localDecorationsDatabase;

        private void OnEnable()
        {
            CRM_Manager.OnDecorationsUpdated += UpdateSceneDecorations;
        }

        private void OnDisable()
        {
            CRM_Manager.OnDecorationsUpdated -= UpdateSceneDecorations;
        }

        private void UpdateSceneDecorations(string[] activeDecorationIds)
        {
            List<string> activeList = new List<string>(activeDecorationIds ?? new string[0]);

            foreach (var data in localDecorationsDatabase)
            {
                if (data.decorationObject != null)
                {
                    bool isActive = activeList.Contains(data.decorationId);
                    data.decorationObject.SetActive(isActive);
                }
            }
        }
    }
}