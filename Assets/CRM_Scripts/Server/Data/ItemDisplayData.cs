using System;
using UnityEngine;

namespace Server.Data
{
    [Serializable]  
    public class ItemDisplayData
    {
        public string itemId;
        public string displayName;
        public Sprite icon;
    }
}