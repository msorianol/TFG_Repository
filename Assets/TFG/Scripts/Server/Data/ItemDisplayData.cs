using System;
using TFG.Scripts.Items;
using UnityEngine;

namespace TFG.Scripts.Server.Data
{
    [Serializable]  
    public class ItemDisplayData
    {
        public string itemId;
        public string displayName;
        public Sprite icon;
        public ItemEffect effect;
    }
}