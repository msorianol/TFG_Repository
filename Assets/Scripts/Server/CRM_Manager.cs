using System;
using System.Collections;
using System.Reflection;
using UnityEngine;
using UnityEngine.Networking;
using Server.Responses;

namespace Server
{
    /// <summary>
    /// Gestor de comunicació amb el servidor LiveOps.
    ///
    /// Flux de caché:
    ///   1. A l'inici i cada 5s: comprova si les dades locals han caducat.
    ///   2. Si NO han caducat: usa les dades del fitxer local sense fer cap petició.
    ///   3. Si SÍ han caducat: fa la petició, guarda la resposta amb el TTL
    ///      que el servidor indica (cacheTtlSeconds) i aplica els canvis.
    ///
    /// Els fitxers de caché es guarden a Application.persistentDataPath:
    ///   liveops_event.json, liveops_shop.json, liveops_price_sword.json, etc.
    /// </summary>
    public class CRM_Manager : MonoBehaviour
    {
        // URLs
        private readonly string _versionUrl = "http://localhost:3000/api/version";
        private readonly string _eventUrl = "http://localhost:3000/api/get-event";
        private readonly string _priceUrl = "http://localhost:3000/api/get-price";
        private readonly string _contractUrl = "http://localhost:3000/api/get-contract";
        private readonly string _shopUrl = "http://localhost:3000/api/get-shop";
        private readonly string _decorationsUrl = "http://localhost:3000/api/get-decorations";

        // Claus de caché
        private const string CACHE_EVENT = "event";
        private const string CACHE_SHOP = "shop";
        private const string CACHE_CONTRACT = "contract";
        private const string CACHE_DECORATIONS = "decorations";

        private long _currentDataVersion = 0;
        private string _lastEventName = "";
        private string[] _currentActiveItems = new string[0];

        public static event Action<string, float, string> OnPriceUpdated;
        public static event Action<string> OnEventUpdated;
        public static event Action<string[]> OnShopItemsUpdated;
        public static event Action<string[]> OnDecorationsUpdated;

        void Start()
        {
            StartCoroutine(InitRoutine());
        }

        IEnumerator InitRoutine()
        {
            yield return StartCoroutine(FetchContract());
            StartCoroutine(PollServerRoutine());
        }

        // Cada 5s comprova si la caché ha caducat.
        // Si no ha caducat, usa les dades locals sense fer cap petició.
        IEnumerator PollServerRoutine()
        {
            while (true)
            {
                yield return StartCoroutine(FetchVersion());
                
                yield return StartCoroutine(FetchEvent());
                yield return StartCoroutine(FetchShop());
                yield return StartCoroutine(FetchDecorations());

                if (_currentActiveItems != null)
                {
                    foreach (string itemId in _currentActiveItems)
                        yield return StartCoroutine(FetchPrice(itemId));
                }

                yield return new WaitForSeconds(5f);
            }
        }

        // CONTRACTE
        IEnumerator FetchContract()
        {
            string cached = LiveOpsCache.Load(CACHE_CONTRACT);
            if (cached != null)
            {
                ApplyContract(cached);
                yield break;
            }

            using (UnityWebRequest req = UnityWebRequest.Get(_contractUrl))
            {
                yield return req.SendWebRequest();
                if (req.result != UnityWebRequest.Result.Success)
                {
                    Debug.LogWarning("[CRM] No s'ha pogut descarregar el contracte: " + req.error);
                    yield break;
                }

                string json = req.downloadHandler.text;
                ContractResponse r = JsonUtility.FromJson<ContractResponse>(json);
                int ttl = (r != null && r.cacheTtlSeconds > 0) ? r.cacheTtlSeconds : 86400;
                LiveOpsCache.Save(CACHE_CONTRACT, json, ttl);
                ApplyContract(json);
            }
        }

        void ApplyContract(string json)
        {
            ContractResponse contract = JsonUtility.FromJson<ContractResponse>(json);
            if (contract == null || contract.inputs == null) return;

            FieldInfo[] fixedFields = typeof(Data.PlayerData)
                .GetFields(BindingFlags.Public | BindingFlags.Instance);

            foreach (string inputName in contract.inputs)
            {
                bool isFixed = false;
                foreach (FieldInfo f in fixedFields)
                    if (f.Name == inputName)
                    {
                        isFixed = true;
                        break;
                    }

                if (!isFixed && !Data.PlayerData.Instance.Has(inputName))
                    Data.PlayerData.Instance.Set(inputName, "0");
            }
        }
        
        // VERSION
        IEnumerator FetchVersion()
        {
            using (UnityWebRequest req = UnityWebRequest.Get(_versionUrl))
            {
                yield return req.SendWebRequest();
                if (req.result == UnityWebRequest.Result.Success)
                {
                    VersionResponse r = JsonUtility.FromJson<VersionResponse>(req.downloadHandler.text);
                    
                    if (_currentDataVersion == 0) 
                    {
                        _currentDataVersion = r.version;
                    }
                    else if (r.version > _currentDataVersion)
                    {
                        Debug.LogWarning("🚨 El servidor ha forçat un refresc! Netejant caché...");
                        LiveOpsCache.InvalidateAll();
                        _currentDataVersion = r.version;
                    }
                }
            }
        }

        // EVENTS
        IEnumerator FetchEvent()
        {
            string cached = LiveOpsCache.Load(CACHE_EVENT);
            if (cached != null)
            {
                ApplyEvent(cached);
                yield break;
            }

            string url = _eventUrl + "?t=" + DateTime.Now.Ticks;
            using (UnityWebRequest req = UnityWebRequest.Get(url))
            {
                yield return req.SendWebRequest();
                if (req.result != UnityWebRequest.Result.Success)
                {
                    Debug.LogWarning("[CRM] Error obtenint event (reintentant en 5s): " + req.error);
                    yield break;
                }

                string json = req.downloadHandler.text;
                EventResponse r = JsonUtility.FromJson<EventResponse>(json);
                int ttl = (r != null && r.cacheTtlSeconds > 0) ? r.cacheTtlSeconds : 300;
                LiveOpsCache.Save(CACHE_EVENT, json, ttl);
                ApplyEvent(json);
            }
        }

        void ApplyEvent(string json)
        {
            EventResponse r = JsonUtility.FromJson<EventResponse>(json);
            if (r == null || r.name == _lastEventName) return;
            _lastEventName = r.name;
            OnEventUpdated?.Invoke(r.name);
            Debug.Log("[CRM] Missatge del servidor: " + r.message);
        }

        // BOTIGA
        IEnumerator FetchShop()
        {
            string cached = LiveOpsCache.Load(CACHE_SHOP);
            if (cached != null)
            {
                ApplyShop(cached);
                yield break;
            }

            using (UnityWebRequest req = UnityWebRequest.Get(_shopUrl))
            {
                yield return req.SendWebRequest();
                if (req.result != UnityWebRequest.Result.Success)
                {
                    Debug.LogWarning("[CRM] Error obtenint items (reintentant en 5s): " + req.error);
                    yield break;
                }

                string json = req.downloadHandler.text;
                ShopResponse r = JsonUtility.FromJson<ShopResponse>(json);
                int ttl = (r != null && r.cacheTtlSeconds > 0) ? r.cacheTtlSeconds : 900;
                LiveOpsCache.Save(CACHE_SHOP, json, ttl);
                ApplyShop(json);
            }
        }

        void ApplyShop(string json)
        {
            ShopResponse r = JsonUtility.FromJson<ShopResponse>(json);
            if (r == null) return;
            _currentActiveItems = r.items ?? new string[0];
            OnShopItemsUpdated?.Invoke(_currentActiveItems);
        }

        // DECORACIONS
        IEnumerator FetchDecorations()
        {
            string cached = LiveOpsCache.Load(CACHE_DECORATIONS);
            if (cached != null)
            {
                ApplyDecorations(cached);
                yield break;
            }

            using (UnityWebRequest req = UnityWebRequest.Get(_decorationsUrl))
            {
                yield return req.SendWebRequest();
                if (req.result != UnityWebRequest.Result.Success)
                {
                    Debug.LogWarning("[CRM] Error obtenint decoracions (reintentant en 5s): " + req.error);
                    yield break;
                }

                string json = req.downloadHandler.text;
                DecorationResponse r = JsonUtility.FromJson<DecorationResponse>(json);
                int ttl = (r != null && r.cacheTtlSeconds > 0) ? r.cacheTtlSeconds : 900;
                LiveOpsCache.Save(CACHE_DECORATIONS, json, ttl);
                ApplyDecorations(json);
            }
        }

        void ApplyDecorations(string json)
        {
            DecorationResponse r = JsonUtility.FromJson<DecorationResponse>(json);
            if (r == null) return;
            OnDecorationsUpdated?.Invoke(r.decorations);
        }

        // PREUS
        IEnumerator FetchPrice(string itemId)
        {
            string cacheKey = "price_" + itemId;
            string cached = LiveOpsCache.Load(cacheKey);
            if (cached != null)
            {
                ApplyPrice(itemId, cached);
                yield break;
            }

            WWWForm form = new WWWForm();
            Data.PlayerData.Instance.itemId = itemId;

            FieldInfo[] fixedFields = typeof(Data.PlayerData)
                .GetFields(BindingFlags.Public | BindingFlags.Instance);

            foreach (FieldInfo field in fixedFields)
            {
                if (field.Name == "extraFields") continue;
                form.AddField(field.Name, field.GetValue(Data.PlayerData.Instance).ToString());
            }

            foreach (var entry in Data.PlayerData.Instance.extraFields)
                form.AddField(entry.Key, entry.Value);

            using (UnityWebRequest req = UnityWebRequest.Post(_priceUrl, form))
            {
                yield return req.SendWebRequest();
                if (req.result != UnityWebRequest.Result.Success)
                {
                    Debug.LogWarning("[CRM] Error obtenint preu de " + itemId + ": " + req.error);
                    yield break;
                }

                string json = req.downloadHandler.text;
                PriceResponse r = JsonUtility.FromJson<PriceResponse>(json);
                int ttl = (r != null && r.cacheTtlSeconds > 0) ? r.cacheTtlSeconds : 3600;
                LiveOpsCache.Save(cacheKey, json, ttl);
                ApplyPrice(itemId, json);
            }
        }

        void ApplyPrice(string itemId, string json)
        {
            PriceResponse r = JsonUtility.FromJson<PriceResponse>(json);
            if (r == null) return;
            string symbol = string.IsNullOrEmpty(r.currency) ? "?" : r.currency;
            OnPriceUpdated?.Invoke(itemId, r.price, symbol);
        }
    }
}