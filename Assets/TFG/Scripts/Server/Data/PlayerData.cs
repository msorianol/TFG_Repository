using System.Collections.Generic;
using UnityEngine;

namespace TFG.Scripts.Server.Data
{
    public class PlayerData : MonoBehaviour
    {
        public static PlayerData Instance;
        
        /* Camp intern usat temporalment pel CRM_Manager per fer consultes de preus
        No representa una dada real del jugador, es sobreescriu a cada petició */
        [HideInInspector]
        public string itemId;
        
        // En cas de voler afegir nous camps, aquí:
        public int playerLevel;
        public int playerXP;
        public string playerClass;
        public int daysPlayed;
        
        public Dictionary<string, string> extraFields = new();

        void Awake()
        {
            if (Instance != null && Instance != this)
            {
                Destroy(gameObject);
                return;
            }
 
            Instance = this;
            DontDestroyOnLoad(gameObject);
        }
        
        // Estableix un camp extra. El valor es converteix a string automàticament
        public void Set(string key, object value)
        {
            extraFields[key] = value.ToString();
        }

        // Obté un camp extra com a string. Retorna "" si no existeix
        public string Get(string key)
        {
            return extraFields.TryGetValue(key, out string value) ? value : "";
        }

        // Comprova si un camp extra existeix
        public bool Has(string key)
        {
            return extraFields.ContainsKey(key);
        }

    }
}