using System;

namespace TFG.Scripts.Server.Responses
{
    [Serializable]
    public class ContractResponse
    {
        public string[] inputs;
        public int cacheTtlSeconds;
    }
}