using System;

namespace Server.Responses
{
    [Serializable]
    public class PriceResponse
    {
        public float price;
        public string currency;
    }
}
