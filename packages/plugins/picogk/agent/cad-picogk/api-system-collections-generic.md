# PicoGK — System.Collections.Generic

3 top-level symbols. Signatures are verbatim csharp.

Dictionary

  Comparer: IEqualityComparer<TKey>

  Count: int

  Capacity: int

  Keys: Dictionary<TKey, TValue>.KeyCollection

  Values: Dictionary<TKey, TValue>.ValueCollection

  this[]: TValue

  AlternateLookup

    Dictionary: Dictionary<TKey, TValue>

    this[]: TValue

    public bool TryGetValue(TAlternateKey key, out TValue value)
    public bool TryGetValue(TAlternateKey key, out TKey actualKey, out TValue value)

    public bool ContainsKey(TAlternateKey key)

    public bool Remove(TAlternateKey key)
    public bool Remove(TAlternateKey key, out TKey actualKey, out TValue value)

    public bool TryAdd(TAlternateKey key, TValue value)

  Enumerator

    Current: KeyValuePair<TKey, TValue>

    public bool MoveNext()

    public void Dispose()

  KeyCollection

    Count: int

    Enumerator

      Current: TKey

      public void Dispose()

      public bool MoveNext()

    public KeyCollection(Dictionary<TKey, TValue> dictionary)

    public Dictionary<TKey, TValue>.KeyCollection.Enumerator GetEnumerator()

    public void CopyTo(TKey[] array, int index)

    public bool Contains(TKey item)

  ValueCollection

    Count: int

    Enumerator

      Current: TValue

      public void Dispose()

      public bool MoveNext()

    public ValueCollection(Dictionary<TKey, TValue> dictionary)

    public Dictionary<TKey, TValue>.ValueCollection.Enumerator GetEnumerator()

    public void CopyTo(TValue[] array, int index)

  public Dictionary()
  public Dictionary(int capacity)
  public Dictionary(IEqualityComparer<TKey>? comparer)
  public Dictionary(int capacity, IEqualityComparer<TKey>? comparer)
  public Dictionary(IDictionary<TKey, TValue> dictionary)
  public Dictionary(IDictionary<TKey, TValue> dictionary, IEqualityComparer<TKey>? comparer)
  public Dictionary(IEnumerable<KeyValuePair<TKey, TValue>> collection)
  public Dictionary(IEnumerable<KeyValuePair<TKey, TValue>> collection, IEqualityComparer<TKey>? comparer)
  protected Dictionary(SerializationInfo info, StreamingContext context)

  public void Add(TKey key, TValue value)

  public void Clear()

  public bool ContainsKey(TKey key)

  public bool ContainsValue(TValue value)

  public Dictionary<TKey, TValue>.Enumerator GetEnumerator()

  // DEPRECATED: This API supports obsolete formatter-based serialization. It should not be called or extended by application code.
  public virtual void GetObjectData(SerializationInfo info, StreamingContext context)

  public Dictionary<TKey, TValue>.AlternateLookup<TAlternateKey> GetAlternateLookup<TAlternateKey>()

  public bool TryGetAlternateLookup<TAlternateKey>(out Dictionary<TKey, TValue>.AlternateLookup<TAlternateKey> lookup)

  public virtual void OnDeserialization(object? sender)

  public bool Remove(TKey key)
  public bool Remove(TKey key, out TValue value)

  public bool TryGetValue(TKey key, out TValue value)

  public bool TryAdd(TKey key, TValue value)

  public int EnsureCapacity(int capacity)

  public void TrimExcess()
  public void TrimExcess(int capacity)

HashSet

  Count: int

  Capacity: int

  Comparer: IEqualityComparer<T>

  AlternateLookup

    Set: HashSet<T>

    public bool Add(TAlternate item)

    public bool Remove(TAlternate item)

    public bool Contains(TAlternate item)

    public bool TryGetValue(TAlternate equalValue, out T actualValue)

  Enumerator

    Current: T

    public bool MoveNext()

    public void Dispose()

  public HashSet()
  public HashSet(IEqualityComparer<T>? comparer)
  public HashSet(int capacity)
  public HashSet(IEnumerable<T> collection)
  public HashSet(IEnumerable<T> collection, IEqualityComparer<T>? comparer)
  public HashSet(int capacity, IEqualityComparer<T>? comparer)
  protected HashSet(SerializationInfo info, StreamingContext context)

  public void Clear()

  public bool Contains(T item)

  public bool Remove(T item)

  public HashSet<T>.AlternateLookup<TAlternate> GetAlternateLookup<TAlternate>()

  public bool TryGetAlternateLookup<TAlternate>(out HashSet<T>.AlternateLookup<TAlternate> lookup)

  public HashSet<T>.Enumerator GetEnumerator()

  // DEPRECATED: This API supports obsolete formatter-based serialization. It should not be called or extended by application code.
  public virtual void GetObjectData(SerializationInfo info, StreamingContext context)

  public virtual void OnDeserialization(object? sender)

  public bool Add(T item)

  public bool TryGetValue(T equalValue, out T actualValue)

  public void UnionWith(IEnumerable<T> other)

  public void IntersectWith(IEnumerable<T> other)

  public void ExceptWith(IEnumerable<T> other)

  public void SymmetricExceptWith(IEnumerable<T> other)

  public bool IsSubsetOf(IEnumerable<T> other)

  public bool IsProperSubsetOf(IEnumerable<T> other)

  public bool IsSupersetOf(IEnumerable<T> other)

  public bool IsProperSupersetOf(IEnumerable<T> other)

  public bool Overlaps(IEnumerable<T> other)

  public bool SetEquals(IEnumerable<T> other)

  public void CopyTo(T[] array)
  public void CopyTo(T[] array, int arrayIndex)
  public void CopyTo(T[] array, int arrayIndex, int count)

  public int RemoveWhere(Predicate<T> match)

  public int EnsureCapacity(int capacity)

  public void TrimExcess()
  public void TrimExcess(int capacity)

  public static IEqualityComparer<HashSet<T>> CreateSetComparer()

List

  Capacity: int

  Count: int

  this[]: T

  Enumerator

    Current: T

    public void Dispose()

    public bool MoveNext()

  public List()
  public List(int capacity)
  public List(IEnumerable<T> collection)

  public void Add(T item)

  public void AddRange(IEnumerable<T> collection)

  public ReadOnlyCollection<T> AsReadOnly()

  public int BinarySearch(int index, int count, T item, IComparer<T>? comparer)
  public int BinarySearch(T item)
  public int BinarySearch(T item, IComparer<T>? comparer)

  public void Clear()

  public bool Contains(T item)

  public List<TOutput> ConvertAll<TOutput>(Converter<T, TOutput> converter)

  public void CopyTo(T[] array)
  public void CopyTo(int index, T[] array, int arrayIndex, int count)
  public void CopyTo(T[] array, int arrayIndex)

  public int EnsureCapacity(int capacity)

  public bool Exists(Predicate<T> match)

  public T? Find(Predicate<T> match)

  public List<T> FindAll(Predicate<T> match)

  public int FindIndex(Predicate<T> match)
  public int FindIndex(int startIndex, Predicate<T> match)
  public int FindIndex(int startIndex, int count, Predicate<T> match)

  public T? FindLast(Predicate<T> match)

  public int FindLastIndex(Predicate<T> match)
  public int FindLastIndex(int startIndex, Predicate<T> match)
  public int FindLastIndex(int startIndex, int count, Predicate<T> match)

  public void ForEach(Action<T> action)

  public List<T>.Enumerator GetEnumerator()

  public List<T> GetRange(int index, int count)

  public List<T> Slice(int start, int length)

  public int IndexOf(T item)
  public int IndexOf(T item, int index)
  public int IndexOf(T item, int index, int count)

  public void Insert(int index, T item)

  public void InsertRange(int index, IEnumerable<T> collection)

  public int LastIndexOf(T item)
  public int LastIndexOf(T item, int index)
  public int LastIndexOf(T item, int index, int count)

  public bool Remove(T item)

  public int RemoveAll(Predicate<T> match)

  public void RemoveAt(int index)

  public void RemoveRange(int index, int count)

  public void Reverse()
  public void Reverse(int index, int count)

  public void Sort()
  public void Sort(IComparer<T>? comparer)
  public void Sort(int index, int count, IComparer<T>? comparer)
  public void Sort(Comparison<T> comparison)

  public T[] ToArray()

  public void TrimExcess()

  public bool TrueForAll(Predicate<T> match)
