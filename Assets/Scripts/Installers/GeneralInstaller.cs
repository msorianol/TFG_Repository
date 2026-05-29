using System.Collections.Generic;
using System.Linq;
using UnityEngine;
using Features.Account;

namespace Core.Installers
{
    public class GeneralInstaller: MonoBehaviour, IUpdateLoop
    {
        private static GeneralInstaller _instance;
        public static GeneralInstaller Instance => _instance;
        
        private AccountModel _accountModel;
        public AccountModel GlobalAccountModel => _accountModel;
        
        private AccountController _accountController;
        public AccountController GlobalAccountController => _accountController;
        
        private readonly List<IUpdateableObjects> _updateables = new();
        
        void Awake()
        {
            if (_instance != null && _instance != this)
            {
                Destroy(gameObject);
                return;
            }

            _instance = this;
            DontDestroyOnLoad(gameObject);
            
            _accountModel = new AccountModel();
            _accountController = new AccountController(_accountModel);
        }
        
        public void Update()
        {
            foreach (var objectsToUpdate in _updateables.ToList())
            {
                objectsToUpdate.Update();
            }
        }
        
        public void RegisterUpdateable(IUpdateableObjects obj)
        { 
            _updateables.Add(obj);
        }

        public void UnregisterUpdateable(IUpdateableObjects obj)
        {
            if (_updateables.Contains(obj)) _updateables.Remove(obj);
        } 
        
        private void OnDestroy()
        {
            if (_instance == this)
            {
                _instance = null;
            }
            
            _updateables.Clear();
        }
    }
}
