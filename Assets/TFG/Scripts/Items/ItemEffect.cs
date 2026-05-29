using UnityEngine;

namespace TFG.Scripts.Items
{
    public abstract class ItemEffect : ScriptableObject
    {
        public abstract void Apply();

        public virtual void Preview() { }
        
        public virtual void Revert() { }
    }
}