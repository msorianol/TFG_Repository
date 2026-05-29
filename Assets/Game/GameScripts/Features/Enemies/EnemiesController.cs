using System;
using System.Collections.Generic;
using UnityEngine;
using R3;
using Core;
using Features.Levels.Levels;
using Features.Enemies.Types.Chaser;
using Features.Player;

namespace Features.Enemies
{
    public class EnemiesController : IDisposable
    {
        private readonly CompositeDisposable _disposables = new();
        private readonly EnemiesModel _enemiesModel;
        private readonly EnemySpawnerView _enemySpawnerView;
        private readonly EnemyBehaviourFactory _behaviourFactory;
        private readonly List<IEnemyBehaviour> _behaviours = new();
        private readonly PlayerView _playerView;

        public EnemiesController(EnemiesModel model, PlayerView playerView, LevelModel levelModel,
            EnemyBehaviourFactory factory)
        {
            _enemiesModel = model;
            _playerView = playerView;
            _behaviourFactory = factory;
            
            levelModel.SpawnPoints
                .Where(points => points != null)
                .Subscribe(SpawnEnemiesFromPoints)
                .AddTo(_disposables);
        }

        private void SpawnEnemiesFromPoints(EnemySpawnPoint[] spawnPoints)
        {
            foreach (var point in spawnPoints)
            {
                if (point.EnemyData == null)
                {
                    continue;
                }

                var behaviour = _behaviourFactory.Create(point.EnemyData, point.transform.position, _enemiesModel,
                    _playerView);
                if (behaviour == null)
                {
                    continue;
                }

                _behaviours.Add(behaviour);
            }
        }

        public void Dispose()
        {
            foreach (var behaviour in _behaviours)
            {
                behaviour.Dispose();
            }

            _disposables.Dispose();
        }
    }
}