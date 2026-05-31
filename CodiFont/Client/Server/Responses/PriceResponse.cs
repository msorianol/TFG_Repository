using System;

namespace TFG.Scripts.Server.Responses
{
    [Serializable]
    public class PriceResponse
    {
        public float price;
        public string currency;
        public int cacheTtlSeconds;
    }
}
