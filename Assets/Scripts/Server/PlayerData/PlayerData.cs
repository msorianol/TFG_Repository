using System.Collections.Generic;
using UnityEngine;

namespace Server.PlayerData
{
    public class PlayerData : MonoBehaviour
    {
        public static PlayerData Instance;
        
        // En cas de voler afegir nous camps, seria aquí:
        public string itemId;
        public int playerLevel;
        public int playerXP;
        public string playerClass;
        public int daysPlayed;
        
        public Dictionary<string, string> extraFields = new Dictionary<string, string>();

        void Awake()
        {
            if (Instance != null)
            {
                Destroy(gameObject);
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