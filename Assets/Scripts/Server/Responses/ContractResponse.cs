using System;

namespace Server.Responses
{
    [Serializable]
    public class ContractResponse
    {
        public string[] inputs;
        public int cacheTtlSeconds;
    }
}