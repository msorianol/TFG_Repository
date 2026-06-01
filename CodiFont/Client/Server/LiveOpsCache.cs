using System;
using System.IO;
using UnityEngine;

namespace TFG.Scripts.Server
{
    /* Gestor de caché local per al sistema LiveOps
     Desa i llegeix dades JSON a Application.persistentDataPath
     Cada entrada té un temps de caducitat configurat pel servidor (cacheTtlSeconds) */
    public static class LiveOpsCache
    {
        // --- Estructura interna d'un fitxer de caché ---
        [Serializable]
        private class CacheEntry
        {
            public string data; // JSON serialitzat de la resposta
            public string expiresAt; // ISO 8601: quan caduca
        }

        // --- API pública ---
        // Guarda una resposta JSON a disc amb el TTL indicat pel servidor
        public static void Save(string key, string jsonData, int ttlSeconds)
        {
            var entry = new CacheEntry
            {
                data = jsonData,
                expiresAt = DateTime.UtcNow.AddSeconds(ttlSeconds)
                    .ToString("o") // ISO 8601
            };
            string path = GetPath(key);
            File.WriteAllText(path, JsonUtility.ToJson(entry));
            Debug.LogWarning($"[CACHE] Guardat '{key}' · caduca en {ttlSeconds}s · path: {path}");
        }

        // Intenta llegir la caché per a una clau
        // Retorna el JSON si existeix i no ha caducat; null en cas contrari
        public static string Load(string key)
        {
            string path = GetPath(key);
            if (!File.Exists(path)) return null;

            try
            {
                string raw = File.ReadAllText(path);
                CacheEntry entry = JsonUtility.FromJson<CacheEntry>(raw);
                DateTime exp = DateTime.Parse(entry.expiresAt,
                    null,
                    System.Globalization.DateTimeStyles.RoundtripKind);

                if (DateTime.UtcNow < exp)
                {
                    TimeSpan left = exp - DateTime.UtcNow;
                    Debug.LogWarning($"[CACHE] HIT '{key}' · caduca en {left.TotalSeconds:F0}s");
                    return entry.data;
                }

                Debug.LogWarning($"[CACHE] EXPIRED '{key}'");
                return null;
            }
            catch (Exception e)
            {
                Debug.LogWarning($"[CACHE] Error llegint '{key}': {e.Message}");
                return null;
            }
        }

        // Invalida (esborra) una entrada de caché
        // Útil si vols forçar una recàrrega des del servidor
        public static void Invalidate(string key)
        {
            string path = GetPath(key);
            if (File.Exists(path))
            {
                File.Delete(path);
                Debug.LogWarning($"[CACHE] Invalidat '{key}'");
            }
        }

        // Invalida totes les entrades de caché LiveOps
        public static void InvalidateAll()
        {
            string dir = Application.persistentDataPath;
            foreach (string f in Directory.GetFiles(dir, "liveops_*.json"))
                File.Delete(f);
            Debug.LogWarning("[CACHE] Tota la caché invalidada");
        }

        // --- Private ---
        private static string GetPath(string key)
            => Path.Combine(Application.persistentDataPath, $"liveops_{key}.json");
    }
}