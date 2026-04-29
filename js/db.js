/**
 * IndexedDB wrapper for the MCP Browser Client MVP.
 *
 * Responsibilities:
 * - Initialize the database and object stores
 * - Provide simple CRUD helpers for:
 *   - servers (MCP servers + model providers)
 *   - models
 *   - skills
 *   - conversations
 *   - messages
 *
 * This is intentionally minimal and promise-based to keep usage simple.
 */

(function () {
  const { db: dbConfig } = window.APP_CONFIG;

  let dbInstance = null;

  /**
   * Open (or create) the IndexedDB database.
   * Returns a Promise that resolves to the IDBDatabase instance.
   */
  function openDb() {
    if (dbInstance) {
      return Promise.resolve(dbInstance);
    }

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(dbConfig.name, dbConfig.version);

      request.onupgradeneeded = function (event) {
        const db = event.target.result;

        // Servers store: MCP servers and model providers
        if (!db.objectStoreNames.contains(dbConfig.stores.servers)) {
          const store = db.createObjectStore(dbConfig.stores.servers, {
            keyPath: 'id',
            autoIncrement: true
          });
          store.createIndex('by_name', 'name', { unique: false });
        }

        // Models store: model definitions
        if (!db.objectStoreNames.contains(dbConfig.stores.models)) {
          const store = db.createObjectStore(dbConfig.stores.models, {
            keyPath: 'id',
            autoIncrement: true
          });
          store.createIndex('by_name', 'name', { unique: false });
        }

        // Skills store: reusable system instructions
        if (!db.objectStoreNames.contains(dbConfig.stores.skills)) {
          const store = db.createObjectStore(dbConfig.stores.skills, {
            keyPath: 'id',
            autoIncrement: true
          });
          store.createIndex('by_name', 'name', { unique: false });
          store.createIndex('by_enabled', 'enabled', { unique: false });
        }

        // Conversations store
        if (!db.objectStoreNames.contains(dbConfig.stores.conversations)) {
          const store = db.createObjectStore(dbConfig.stores.conversations, {
            keyPath: 'id',
            autoIncrement: true
          });
          store.createIndex('by_serverId', 'serverId', { unique: false });
          store.createIndex('by_modelId', 'modelId', { unique: false });
        }

        // Messages store
        if (!db.objectStoreNames.contains(dbConfig.stores.messages)) {
          const store = db.createObjectStore(dbConfig.stores.messages, {
            keyPath: 'id',
            autoIncrement: true
          });
          store.createIndex('by_conversationId', 'conversationId', { unique: false });
          store.createIndex('by_createdAt', 'createdAt', { unique: false });
        }

        // Meta store: generic key/value
        if (!db.objectStoreNames.contains(dbConfig.stores.meta)) {
          db.createObjectStore(dbConfig.stores.meta, {
            keyPath: 'key'
          });
        }
      };

      request.onsuccess = function (event) {
        dbInstance = event.target.result;
        resolve(dbInstance);
      };

      request.onerror = function (event) {
        reject(event.target.error || new Error('Failed to open IndexedDB'));
      };
    });
  }

  /**
   * Helper to run a transaction and get an object store.
   */
  function withStore(storeName, mode, callback) {
    return openDb().then((db) => {
      return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, mode);
        const store = tx.objectStore(storeName);

        let result;
        try {
          result = callback(store, tx);
        } catch (err) {
          reject(err);
          return;
        }

        tx.oncomplete = function () {
          resolve(result);
        };
        tx.onerror = function (event) {
          reject(event.target.error || new Error('Transaction failed'));
        };
        tx.onabort = function (event) {
          reject(event.target.error || new Error('Transaction aborted'));
        };
      });
    });
  }

  // Generic helpers

  function addItem(storeName, item) {
    const now = new Date().toISOString();
    if (!item.createdAt) item.createdAt = now;
    item.updatedAt = now;

    return withStore(storeName, 'readwrite', (store) => {
      const request = store.add(item);
      return new Promise((resolve, reject) => {
        request.onsuccess = function (event) {
          resolve(event.target.result);
        };
        request.onerror = function (event) {
          reject(event.target.error || new Error('Failed to add item'));
        };
      });
    });
  }

  function updateItem(storeName, item) {
    const now = new Date().toISOString();
    item.updatedAt = now;

    return withStore(storeName, 'readwrite', (store) => {
      const request = store.put(item);
      return new Promise((resolve, reject) => {
        request.onsuccess = function () {
          resolve(item.id);
        };
        request.onerror = function (event) {
          reject(event.target.error || new Error('Failed to update item'));
        };
      });
    });
  }

  function deleteItem(storeName, id) {
    return withStore(storeName, 'readwrite', (store) => {
      const request = store.delete(id);
      return new Promise((resolve, reject) => {
        request.onsuccess = function () {
          resolve();
        };
        request.onerror = function (event) {
          reject(event.target.error || new Error('Failed to delete item'));
        };
      });
    });
  }

  function getItem(storeName, id) {
    return withStore(storeName, 'readonly', (store) => {
      const request = store.get(id);
      return new Promise((resolve, reject) => {
        request.onsuccess = function (event) {
          resolve(event.target.result || null);
        };
        request.onerror = function (event) {
          reject(event.target.error || new Error('Failed to get item'));
        };
      });
    });
  }

  function getAllItems(storeName, indexName, indexValue) {
    return withStore(storeName, 'readonly', (store) => {
      let source = store;
      if (indexName) {
        source = store.index(indexName);
      }

      const request = indexName ? source.getAll(indexValue) : source.getAll();

      return new Promise((resolve, reject) => {
        request.onsuccess = function (event) {
          resolve(event.target.result || []);
        };
        request.onerror = function (event) {
          reject(event.target.error || new Error('Failed to get items'));
        };
      });
    });
  }

  // Meta helpers (key/value)

  function setMeta(key, value) {
    return withStore(dbConfig.stores.meta, 'readwrite', (store) => {
      const record = { key, value };
      const request = store.put(record);
      return new Promise((resolve, reject) => {
        request.onsuccess = function () {
          resolve();
        };
        request.onerror = function (event) {
          reject(event.target.error || new Error('Failed to set meta'));
        };
      });
    });
  }

  function getMeta(key, defaultValue = null) {
    return withStore(dbConfig.stores.meta, 'readonly', (store) => {
      const request = store.get(key);
      return new Promise((resolve, reject) => {
        request.onsuccess = function (event) {
          const record = event.target.result;
          if (!record) {
            resolve(defaultValue);
          } else {
            resolve(record.value);
          }
        };
        request.onerror = function (event) {
          reject(event.target.error || new Error('Failed to get meta'));
        };
      });
    });
  }

  // Domain-specific helpers

  // Servers
  function addServer(server) {
    return addItem(dbConfig.stores.servers, server);
  }

  function updateServer(server) {
    return updateItem(dbConfig.stores.servers, server);
  }

  function deleteServer(id) {
    return deleteItem(dbConfig.stores.servers, id);
  }

  function getServer(id) {
    return getItem(dbConfig.stores.servers, id);
  }

  function getAllServers() {
    return getAllItems(dbConfig.stores.servers);
  }

  // Models
  function addModel(model) {
    // Do NOT include an id when adding; the store is autoIncrement.
    const clean = {
      name: model.name,
      providerType: model.providerType,
      config: model.config
    };
    return addItem(dbConfig.stores.models, clean);
  }

  function updateModel(model) {
    if (model.id == null) {
      return Promise.reject(new Error('updateModel requires model.id'));
    }
    const clean = {
      id: model.id,
      name: model.name,
      providerType: model.providerType,
      config: model.config
    };
    return updateItem(dbConfig.stores.models, clean);
  }

  function deleteModel(id) {
    return deleteItem(dbConfig.stores.models, id);
  }

  function getModel(id) {
    return getItem(dbConfig.stores.models, id);
  }

  function getAllModels() {
    return getAllItems(dbConfig.stores.models);
  }

  // Skills
  async function _hasStore(storeName) {
    const db = await openDb();
    return db.objectStoreNames.contains(storeName);
  }

  async function _getSkillsFromMeta() {
    const skills = await getMeta('skills', []);
    return Array.isArray(skills) ? skills : [];
  }

  async function _setSkillsInMeta(skills) {
    await setMeta('skills', Array.isArray(skills) ? skills : []);
  }

  async function addSkill(skill) {
    const clean = {
      name: skill.name,
      description: skill.description || '',
      instructions: skill.instructions || '',
      enabled: skill.enabled !== false
    };

    if (!(await _hasStore(dbConfig.stores.skills))) {
      const skills = await _getSkillsFromMeta();
      const maxId = skills.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0);
      clean.id = maxId + 1;
      const now = new Date().toISOString();
      clean.createdAt = now;
      clean.updatedAt = now;
      skills.push(clean);
      await _setSkillsInMeta(skills);
      return clean.id;
    }

    return addItem(dbConfig.stores.skills, clean);
  }

  async function updateSkill(skill) {
    if (skill.id == null) {
      return Promise.reject(new Error('updateSkill requires skill.id'));
    }
    const clean = {
      id: skill.id,
      name: skill.name,
      description: skill.description || '',
      instructions: skill.instructions || '',
      enabled: skill.enabled !== false
    };

    if (!(await _hasStore(dbConfig.stores.skills))) {
      const skills = await _getSkillsFromMeta();
      const idx = skills.findIndex((item) => item && item.id === clean.id);
      if (idx < 0) {
        throw new Error('Skill not found');
      }
      clean.createdAt = skills[idx].createdAt;
      clean.updatedAt = new Date().toISOString();
      skills[idx] = clean;
      await _setSkillsInMeta(skills);
      return clean.id;
    }

    return updateItem(dbConfig.stores.skills, clean);
  }

  async function deleteSkill(id) {
    if (!(await _hasStore(dbConfig.stores.skills))) {
      const skills = await _getSkillsFromMeta();
      await _setSkillsInMeta(skills.filter((item) => item && item.id !== id));
      return;
    }

    return deleteItem(dbConfig.stores.skills, id);
  }

  async function getSkill(id) {
    if (!(await _hasStore(dbConfig.stores.skills))) {
      const skills = await _getSkillsFromMeta();
      return skills.find((item) => item && item.id === id) || null;
    }

    return getItem(dbConfig.stores.skills, id);
  }

  async function getAllSkills() {
    if (!(await _hasStore(dbConfig.stores.skills))) {
      return _getSkillsFromMeta();
    }

    return getAllItems(dbConfig.stores.skills);
  }

  // Conversations
  function addConversation(conversation) {
    return addItem(dbConfig.stores.conversations, conversation);
  }

  function updateConversation(conversation) {
    return updateItem(dbConfig.stores.conversations, conversation);
  }

  function deleteConversation(id) {
    return deleteItem(dbConfig.stores.conversations, id);
  }

  function getConversation(id) {
    return getItem(dbConfig.stores.conversations, id);
  }

  function getAllConversations() {
    return getAllItems(dbConfig.stores.conversations);
  }

  // Messages
  function addMessage(message) {
    return addItem(dbConfig.stores.messages, message);
  }

  function updateMessage(message) {
    if (!message || message.id == null) {
      return Promise.reject(new Error('updateMessage requires message.id'));
    }
    return updateItem(dbConfig.stores.messages, message);
  }

  function deleteMessage(id) {
    return deleteItem(dbConfig.stores.messages, id);
  }

  function getMessage(id) {
    return getItem(dbConfig.stores.messages, id);
  }

  function getMessagesByConversation(conversationId) {
    return getAllItems(dbConfig.stores.messages, 'by_conversationId', conversationId).then(
      (messages) => {
        // Sort by createdAt ascending
        return messages.sort((a, b) => {
          if (!a.createdAt || !b.createdAt) return 0;
          return a.createdAt.localeCompare(b.createdAt);
        });
      }
    );
  }

  /**
   * Delete all messages in a conversation that come AFTER the given messageId,
   * based on the conversation's chronological order (createdAt ascending).
   *
   * @param {number} conversationId
   * @param {number} messageId
   * @returns {Promise<number>} number of deleted messages
   */
  async function deleteMessagesAfter(conversationId, messageId) {
    const convId = Number(conversationId);
    const msgId = Number(messageId);
    if (Number.isNaN(convId) || Number.isNaN(msgId)) {
      throw new Error('deleteMessagesAfter requires numeric conversationId and messageId');
    }

    const messages = await getMessagesByConversation(convId);
    const idx = messages.findIndex((m) => m && m.id === msgId);
    if (idx < 0) {
      throw new Error('Message not found in conversation');
    }

    const toDelete = messages.slice(idx + 1);
    for (const m of toDelete) {
      if (m && m.id != null) {
        await deleteMessage(m.id);
      }
    }
    return toDelete.length;
  }

  // Expose a simple API on window
  window.DB = {
    openDb,

    // generic
    addItem,
    updateItem,
    deleteItem,
    getItem,
    getAllItems,

    // meta
    setMeta,
    getMeta,

    // servers
    addServer,
    updateServer,
    deleteServer,
    getServer,
    getAllServers,

    // models
    addModel,
    updateModel,
    deleteModel,
    getModel,
    getAllModels,

    // skills
    addSkill,
    updateSkill,
    deleteSkill,
    getSkill,
    getAllSkills,

    // conversations
    addConversation,
    updateConversation,
    deleteConversation,
    getConversation,
    getAllConversations,

    // messages
    addMessage,
    updateMessage,
    deleteMessage,
    getMessage,
    getMessagesByConversation,
    deleteMessagesAfter
  };
})();
