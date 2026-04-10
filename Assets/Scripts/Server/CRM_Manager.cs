using System;
using System.Collections;
using System.Reflection;
using UnityEngine;
using UnityEngine.Networking;
using Server.Responses;

namespace Server
{
    public class CRM_Manager : MonoBehaviour
    {
        private readonly string _eventUrl = "http://localhost:3000/api/get-event";
        private readonly string _priceUrl = "http://localhost:3000/api/get-price";
        private readonly string _contractUrl = "http://localhost:3000/api/get-contract";
        private readonly string _shopUrl = "http://localhost:3000/api/get-shop";
        private readonly string _decorationsUrl = "http://localhost:3000/api/get-decorations";

        private string _lastEventName = "";

        public static event Action<string, float, string> OnPriceUpdated;
        public static event Action<string> OnEventUpdated;
        public static event Action<string[]> OnShopItemsUpdated;
        public static event Action<string[]> OnDecorationsUpdated;
        
        private string[] _currentActiveItems = new string[0];

        void Start()
        {
            StartCoroutine(InitRoutine());
        }

        // Primer de tot, baixem el contracte del servidor per saber quins camps extra necessita
        IEnumerator InitRoutine()
        {
            yield return StartCoroutine(FetchContractAndPopulateExtraFields());
            StartCoroutine(PollServerRoutine());
        }

        // Demana al servidor la llista d'inputs actius. Crea automàticament les entrades al diccionari extraFields de PlayerData per als camps nous
        IEnumerator FetchContractAndPopulateExtraFields()
        {
            using (UnityWebRequest request = UnityWebRequest.Get(_contractUrl))
            {
                yield return request.SendWebRequest();

                if (request.result != UnityWebRequest.Result.Success)
                {
                    Debug.LogWarning("[CRM] No s'ha pogut descarregar el contracte: " + request.error);
                    yield break;
                }

                ContractResponse contract = JsonUtility.FromJson<ContractResponse>(request.downloadHandler.text);

                if (contract == null || contract.inputs == null)
                {
                    Debug.LogWarning("[CRM] Contracte buit o mal format.");
                    yield break;
                }

                // Obtenim els camps fixos de PlayerData per comparar
                FieldInfo[] fixedFields = typeof(Data.PlayerData)
                    .GetFields(BindingFlags.Public | BindingFlags.Instance);

                int newFieldsCount = 0;

                foreach (string inputName in contract.inputs)
                {
                    // Comprovem si és un camp fix (itemId, playerLevel, etc.)
                    bool isFixedField = false;
                    foreach (FieldInfo f in fixedFields)
                    {
                        if (f.Name == inputName)
                        {
                            isFixedField = true;
                            break;
                        }
                    }

                    // Si NO és un camp fix ni el diccionari el té ja, l'afegim com a extra
                    if (!isFixedField && !Data.PlayerData.Instance.Has(inputName))
                    {
                        Data.PlayerData.Instance.Set(inputName, "0"); // Valor per defecte
                        newFieldsCount++;
                    }
                }
            }
        }

        // Es comproven esdeveniments i preus
        IEnumerator PollServerRoutine()
        {
            while (true)
            {
                yield return StartCoroutine(CheckForEventUpdates());
                yield return StartCoroutine(CheckForShopUpdates());
                yield return StartCoroutine(CheckForDecorationsUpdates());
                
                if (_currentActiveItems != null)
                {
                    foreach (string itemId in _currentActiveItems)
                    {
                        yield return StartCoroutine(GetItemPrice(itemId));
                    }
                }

                // S'espera 5 segons abans de tornar a preguntar
                yield return new WaitForSeconds(5f);
            }
        }

        IEnumerator CheckForEventUpdates()
        {
            // S'afegeix l'hora actual a la URL per evitar caché
            string antiCacheUrl = _eventUrl + "?t=" + DateTime.Now.Ticks;

            using (UnityWebRequest request = UnityWebRequest.Get(antiCacheUrl))
            {
                yield return request.SendWebRequest();

                if (request.result == UnityWebRequest.Result.Success)
                {
                    string json = request.downloadHandler.text;
                    EventResponse eventResponse = JsonUtility.FromJson<EventResponse>(json);

                    // Només s'apliquen canvis si l'esdeveniment és nou
                    if (eventResponse.name != _lastEventName)
                    {
                        _lastEventName = eventResponse.name;
                        ApplyEventChanges(eventResponse);
                    }
                }
                else
                {
                    Debug.LogWarning("[CRM] Error obtenint event (reintentant en 5s): " + request.error);
                }
            }
        }
        
        IEnumerator CheckForShopUpdates()
        {
            using (UnityWebRequest request = UnityWebRequest.Get(_shopUrl))
            {
                yield return request.SendWebRequest();

                if (request.result == UnityWebRequest.Result.Success)
                {
                    string json = request.downloadHandler.text;
                    ShopResponse shopResponse = JsonUtility.FromJson<ShopResponse>(json);
            
                    _currentActiveItems = shopResponse.items;
                    OnShopItemsUpdated?.Invoke(_currentActiveItems);
                }
                else
                {
                    Debug.LogWarning("[CRM] Error obtenint items (reintentant en 5s): " + request.error);
                }
            }
        }
        
        IEnumerator CheckForDecorationsUpdates()
        {
            using (UnityWebRequest request = UnityWebRequest.Get(_decorationsUrl))
            {
                yield return request.SendWebRequest();

                if (request.result == UnityWebRequest.Result.Success)
                {
                    string json = request.downloadHandler.text;
                    DecorationResponse decResponse = JsonUtility.FromJson<DecorationResponse>(json);
                    
                    OnDecorationsUpdated?.Invoke(decResponse.decorations);
                }
                else
                {
                    Debug.LogWarning("[CRM] Error obtenint decoracions (reintentant en 5s): " + request.error);
                }
            }
        }

        IEnumerator GetItemPrice(string itemIdToAsk)
        {
            WWWForm form = new WWWForm();
            Data.PlayerData.Instance.itemId = itemIdToAsk;

            // Enviem els camps FIXOS amb reflection
            FieldInfo[] fixedFields = typeof(Data.PlayerData)
                .GetFields(BindingFlags.Public | BindingFlags.Instance);

            foreach (FieldInfo field in fixedFields)
            {
                // Saltem el diccionari extraFields (no és un camp simple)
                if (field.Name == "extraFields") continue;

                string fieldValue = field.GetValue(Data.PlayerData.Instance).ToString();
                form.AddField(field.Name, fieldValue);
            }

            // Enviem els camps DINÀMICS del diccionari
            foreach (var entry in Data.PlayerData.Instance.extraFields)
            {
                form.AddField(entry.Key, entry.Value);
            }

            using (UnityWebRequest request = UnityWebRequest.Post(_priceUrl, form))
            {
                yield return request.SendWebRequest();

                if (request.result == UnityWebRequest.Result.Success)
                {
                    PriceResponse response = JsonUtility.FromJson<PriceResponse>(request.downloadHandler.text);

                    string currencySymbol = string.IsNullOrEmpty(response.currency) ? "?" : response.currency;
                    OnPriceUpdated?.Invoke(itemIdToAsk, response.price, currencySymbol);
                }
                else
                {
                    Debug.LogWarning("[CRM] Error obtenint preu de " + itemIdToAsk + ": " + request.error);
                }
            }
        }

        void ApplyEventChanges(EventResponse response)
        {
            OnEventUpdated?.Invoke(response.name);

            Debug.Log("[CRM] Missatge del servidor: " + response.message);
        }
    }
}