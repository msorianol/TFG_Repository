using R3;
using UnityEngine;

namespace Features.Account
{
    public class AccountModel
    {
        public ReactiveProperty<int> Level { get; } = new(1);
        public ReactiveProperty<int> TotalXP { get; } = new(0);
        public ReactiveProperty<int> XPToNext { get; } = new(200);
        
        public Subject<int> OnLevelUp { get; } = new();
    }
}