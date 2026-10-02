# PicoGK — Selected BCL reference — System.Collections.Generic

3 top-level symbols. Signatures are verbatim csharp.

// Category: Selected BCL reference
// System.Collections.Generic.Dictionary (class)
public class Dictionary<TKey, TValue> where TKey : notnull

  // System.Collections.Generic.Dictionary.Comparer (property)
  public IEqualityComparer<TKey> Comparer { get; }

  // System.Collections.Generic.Dictionary.Count (property)
  public int Count { get; }

  // System.Collections.Generic.Dictionary.Capacity (property)
  public int Capacity { get; }

  // System.Collections.Generic.Dictionary.Keys (property)
  public Dictionary<TKey, TValue>.KeyCollection Keys { get; }

  // System.Collections.Generic.Dictionary.Values (property)
  public Dictionary<TKey, TValue>.ValueCollection Values { get; }

  // System.Collections.Generic.Dictionary.this[TKey key] (property)
  public TValue this[TKey key] { get; set; }

  // System.Collections.Generic.Dictionary.AlternateLookup (struct)
  public readonly struct AlternateLookup<TAlternateKey> where TAlternateKey : notnull, allows ref struct

    // System.Collections.Generic.Dictionary.AlternateLookup.Dictionary (property)
    public Dictionary<TKey, TValue> Dictionary { get; }

    // System.Collections.Generic.Dictionary.AlternateLookup.this[TAlternateKey key] (property)
    public TValue this[TAlternateKey key] { get; set; }

    // System.Collections.Generic.Dictionary.AlternateLookup.AlternateLookup (constructor)
    public AlternateLookup()

    // System.Collections.Generic.Dictionary.AlternateLookup.TryGetValue (method)
    public bool TryGetValue(TAlternateKey key, out TValue value)
    public bool TryGetValue(TAlternateKey key, out TKey actualKey, out TValue value)

    // System.Collections.Generic.Dictionary.AlternateLookup.ContainsKey (method)
    public bool ContainsKey(TAlternateKey key)

    // System.Collections.Generic.Dictionary.AlternateLookup.Remove (method)
    public bool Remove(TAlternateKey key)
    public bool Remove(TAlternateKey key, out TKey actualKey, out TValue value)

    // System.Collections.Generic.Dictionary.AlternateLookup.TryAdd (method)
    public bool TryAdd(TAlternateKey key, TValue value)

  // System.Collections.Generic.Dictionary.Enumerator (struct)
  public struct Enumerator

    // System.Collections.Generic.Dictionary.Enumerator.Current (property)
    public KeyValuePair<TKey, TValue> Current { get; }

    // System.Collections.Generic.Dictionary.Enumerator.Enumerator (constructor)
    public Enumerator()

    // System.Collections.Generic.Dictionary.Enumerator.MoveNext (method)
    public bool MoveNext()

    // System.Collections.Generic.Dictionary.Enumerator.Dispose (method)
    public void Dispose()

  // System.Collections.Generic.Dictionary.KeyCollection (class)
  public sealed class KeyCollection

    // System.Collections.Generic.Dictionary.KeyCollection.Count (property)
    public int Count { get; }

    // System.Collections.Generic.Dictionary.KeyCollection.Enumerator (struct)
    public struct Enumerator

      // System.Collections.Generic.Dictionary.KeyCollection.Enumerator.Current (property)
      public TKey Current { get; }

      // System.Collections.Generic.Dictionary.KeyCollection.Enumerator.Enumerator (constructor)
      public Enumerator()

      // System.Collections.Generic.Dictionary.KeyCollection.Enumerator.Dispose (method)
      public void Dispose()

      // System.Collections.Generic.Dictionary.KeyCollection.Enumerator.MoveNext (method)
      public bool MoveNext()

    // System.Collections.Generic.Dictionary.KeyCollection.KeyCollection (constructor)
    public KeyCollection(Dictionary<TKey, TValue> dictionary)

    // System.Collections.Generic.Dictionary.KeyCollection.GetEnumerator (method)
    public Dictionary<TKey, TValue>.KeyCollection.Enumerator GetEnumerator()

    // System.Collections.Generic.Dictionary.KeyCollection.CopyTo (method)
    public void CopyTo(TKey[] array, int index)

    // System.Collections.Generic.Dictionary.KeyCollection.Contains (method)
    public bool Contains(TKey item)

  // System.Collections.Generic.Dictionary.ValueCollection (class)
  public sealed class ValueCollection

    // System.Collections.Generic.Dictionary.ValueCollection.Count (property)
    public int Count { get; }

    // System.Collections.Generic.Dictionary.ValueCollection.Enumerator (struct)
    public struct Enumerator

      // System.Collections.Generic.Dictionary.ValueCollection.Enumerator.Current (property)
      public TValue Current { get; }

      // System.Collections.Generic.Dictionary.ValueCollection.Enumerator.Enumerator (constructor)
      public Enumerator()

      // System.Collections.Generic.Dictionary.ValueCollection.Enumerator.Dispose (method)
      public void Dispose()

      // System.Collections.Generic.Dictionary.ValueCollection.Enumerator.MoveNext (method)
      public bool MoveNext()

    // System.Collections.Generic.Dictionary.ValueCollection.ValueCollection (constructor)
    public ValueCollection(Dictionary<TKey, TValue> dictionary)

    // System.Collections.Generic.Dictionary.ValueCollection.GetEnumerator (method)
    public Dictionary<TKey, TValue>.ValueCollection.Enumerator GetEnumerator()

    // System.Collections.Generic.Dictionary.ValueCollection.CopyTo (method)
    public void CopyTo(TValue[] array, int index)

  // System.Collections.Generic.Dictionary.Dictionary (constructor)
  public Dictionary()
  public Dictionary(int capacity)
  public Dictionary(IEqualityComparer<TKey>? comparer)
  public Dictionary(int capacity, IEqualityComparer<TKey>? comparer)
  public Dictionary(IDictionary<TKey, TValue> dictionary)
  public Dictionary(IDictionary<TKey, TValue> dictionary, IEqualityComparer<TKey>? comparer)
  public Dictionary(IEnumerable<KeyValuePair<TKey, TValue>> collection)
  public Dictionary(IEnumerable<KeyValuePair<TKey, TValue>> collection, IEqualityComparer<TKey>? comparer)
  protected Dictionary(SerializationInfo info, StreamingContext context)

  // System.Collections.Generic.Dictionary.Add (method)
  public void Add(TKey key, TValue value)

  // System.Collections.Generic.Dictionary.Clear (method)
  public void Clear()

  // System.Collections.Generic.Dictionary.ContainsKey (method)
  public bool ContainsKey(TKey key)

  // System.Collections.Generic.Dictionary.ContainsValue (method)
  public bool ContainsValue(TValue value)

  // System.Collections.Generic.Dictionary.GetEnumerator (method)
  public Dictionary<TKey, TValue>.Enumerator GetEnumerator()

  // DEPRECATED: This API supports obsolete formatter-based serialization. It should not be called or extended by application code.
  // System.Collections.Generic.Dictionary.GetObjectData (method)
  public virtual void GetObjectData(SerializationInfo info, StreamingContext context)

  // System.Collections.Generic.Dictionary.GetAlternateLookup (method)
  public Dictionary<TKey, TValue>.AlternateLookup<TAlternateKey> GetAlternateLookup<TAlternateKey>()

  // System.Collections.Generic.Dictionary.TryGetAlternateLookup (method)
  public bool TryGetAlternateLookup<TAlternateKey>(out Dictionary<TKey, TValue>.AlternateLookup<TAlternateKey> lookup)

  // System.Collections.Generic.Dictionary.OnDeserialization (method)
  public virtual void OnDeserialization(object? sender)

  // System.Collections.Generic.Dictionary.Remove (method)
  public bool Remove(TKey key)
  public bool Remove(TKey key, out TValue value)

  // System.Collections.Generic.Dictionary.TryGetValue (method)
  public bool TryGetValue(TKey key, out TValue value)

  // System.Collections.Generic.Dictionary.TryAdd (method)
  public bool TryAdd(TKey key, TValue value)

  // System.Collections.Generic.Dictionary.EnsureCapacity (method)
  public int EnsureCapacity(int capacity)

  // System.Collections.Generic.Dictionary.TrimExcess (method)
  public void TrimExcess()
  public void TrimExcess(int capacity)

// Category: Selected BCL reference
// System.Collections.Generic.HashSet (class)
public class HashSet<T>

  // System.Collections.Generic.HashSet.Count (property)
  public int Count { get; }

  // System.Collections.Generic.HashSet.Capacity (property)
  public int Capacity { get; }

  // System.Collections.Generic.HashSet.Comparer (property)
  public IEqualityComparer<T> Comparer { get; }

  // System.Collections.Generic.HashSet.AlternateLookup (struct)
  public struct AlternateLookup<TAlternate> where TAlternate : allows ref struct

    // System.Collections.Generic.HashSet.AlternateLookup.Set (property)
    public readonly HashSet<T> Set { get; }

    // System.Collections.Generic.HashSet.AlternateLookup.AlternateLookup (constructor)
    public AlternateLookup()

    // System.Collections.Generic.HashSet.AlternateLookup.Add (method)
    public bool Add(TAlternate item)

    // System.Collections.Generic.HashSet.AlternateLookup.Remove (method)
    public bool Remove(TAlternate item)

    // System.Collections.Generic.HashSet.AlternateLookup.Contains (method)
    public bool Contains(TAlternate item)

    // System.Collections.Generic.HashSet.AlternateLookup.TryGetValue (method)
    public bool TryGetValue(TAlternate equalValue, out T actualValue)

  // System.Collections.Generic.HashSet.Enumerator (struct)
  public struct Enumerator

    // System.Collections.Generic.HashSet.Enumerator.Current (property)
    public T Current { get; }

    // System.Collections.Generic.HashSet.Enumerator.Enumerator (constructor)
    public Enumerator()

    // System.Collections.Generic.HashSet.Enumerator.MoveNext (method)
    public bool MoveNext()

    // System.Collections.Generic.HashSet.Enumerator.Dispose (method)
    public void Dispose()

  // System.Collections.Generic.HashSet.HashSet (constructor)
  public HashSet()
  public HashSet(IEqualityComparer<T>? comparer)
  public HashSet(int capacity)
  public HashSet(IEnumerable<T> collection)
  public HashSet(IEnumerable<T> collection, IEqualityComparer<T>? comparer)
  public HashSet(int capacity, IEqualityComparer<T>? comparer)
  protected HashSet(SerializationInfo info, StreamingContext context)

  // System.Collections.Generic.HashSet.Clear (method)
  public void Clear()

  // System.Collections.Generic.HashSet.Contains (method)
  public bool Contains(T item)

  // System.Collections.Generic.HashSet.Remove (method)
  public bool Remove(T item)

  // System.Collections.Generic.HashSet.GetAlternateLookup (method)
  public HashSet<T>.AlternateLookup<TAlternate> GetAlternateLookup<TAlternate>()

  // System.Collections.Generic.HashSet.TryGetAlternateLookup (method)
  public bool TryGetAlternateLookup<TAlternate>(out HashSet<T>.AlternateLookup<TAlternate> lookup)

  // System.Collections.Generic.HashSet.GetEnumerator (method)
  public HashSet<T>.Enumerator GetEnumerator()

  // DEPRECATED: This API supports obsolete formatter-based serialization. It should not be called or extended by application code.
  // System.Collections.Generic.HashSet.GetObjectData (method)
  public virtual void GetObjectData(SerializationInfo info, StreamingContext context)

  // System.Collections.Generic.HashSet.OnDeserialization (method)
  public virtual void OnDeserialization(object? sender)

  // System.Collections.Generic.HashSet.Add (method)
  public bool Add(T item)

  // System.Collections.Generic.HashSet.TryGetValue (method)
  public bool TryGetValue(T equalValue, out T actualValue)

  // System.Collections.Generic.HashSet.UnionWith (method)
  public void UnionWith(IEnumerable<T> other)

  // System.Collections.Generic.HashSet.IntersectWith (method)
  public void IntersectWith(IEnumerable<T> other)

  // System.Collections.Generic.HashSet.ExceptWith (method)
  public void ExceptWith(IEnumerable<T> other)

  // System.Collections.Generic.HashSet.SymmetricExceptWith (method)
  public void SymmetricExceptWith(IEnumerable<T> other)

  // System.Collections.Generic.HashSet.IsSubsetOf (method)
  public bool IsSubsetOf(IEnumerable<T> other)

  // System.Collections.Generic.HashSet.IsProperSubsetOf (method)
  public bool IsProperSubsetOf(IEnumerable<T> other)

  // System.Collections.Generic.HashSet.IsSupersetOf (method)
  public bool IsSupersetOf(IEnumerable<T> other)

  // System.Collections.Generic.HashSet.IsProperSupersetOf (method)
  public bool IsProperSupersetOf(IEnumerable<T> other)

  // System.Collections.Generic.HashSet.Overlaps (method)
  public bool Overlaps(IEnumerable<T> other)

  // System.Collections.Generic.HashSet.SetEquals (method)
  public bool SetEquals(IEnumerable<T> other)

  // System.Collections.Generic.HashSet.CopyTo (method)
  public void CopyTo(T[] array)
  public void CopyTo(T[] array, int arrayIndex)
  public void CopyTo(T[] array, int arrayIndex, int count)

  // System.Collections.Generic.HashSet.RemoveWhere (method)
  public int RemoveWhere(Predicate<T> match)

  // System.Collections.Generic.HashSet.EnsureCapacity (method)
  public int EnsureCapacity(int capacity)

  // System.Collections.Generic.HashSet.TrimExcess (method)
  public void TrimExcess()
  public void TrimExcess(int capacity)

  // System.Collections.Generic.HashSet.CreateSetComparer (method)
  public static IEqualityComparer<HashSet<T>> CreateSetComparer()

// Category: Selected BCL reference
// System.Collections.Generic.List (class)
public class List<T>

  // System.Collections.Generic.List.Capacity (property)
  public int Capacity { get; set; }

  // System.Collections.Generic.List.Count (property)
  public int Count { get; }

  // System.Collections.Generic.List.this[int index] (property)
  public T this[int index] { get; set; }

  // System.Collections.Generic.List.Enumerator (struct)
  public struct Enumerator

    // System.Collections.Generic.List.Enumerator.Current (property)
    public T Current { get; }

    // System.Collections.Generic.List.Enumerator.Enumerator (constructor)
    public Enumerator()

    // System.Collections.Generic.List.Enumerator.Dispose (method)
    public void Dispose()

    // System.Collections.Generic.List.Enumerator.MoveNext (method)
    public bool MoveNext()

  // System.Collections.Generic.List.List (constructor)
  public List()
  public List(int capacity)
  public List(IEnumerable<T> collection)

  // System.Collections.Generic.List.Add (method)
  public void Add(T item)

  // System.Collections.Generic.List.AddRange (method)
  public void AddRange(IEnumerable<T> collection)

  // System.Collections.Generic.List.AsReadOnly (method)
  public ReadOnlyCollection<T> AsReadOnly()

  // System.Collections.Generic.List.BinarySearch (method)
  public int BinarySearch(int index, int count, T item, IComparer<T>? comparer)
  public int BinarySearch(T item)
  public int BinarySearch(T item, IComparer<T>? comparer)

  // System.Collections.Generic.List.Clear (method)
  public void Clear()

  // System.Collections.Generic.List.Contains (method)
  public bool Contains(T item)

  // System.Collections.Generic.List.ConvertAll (method)
  public List<TOutput> ConvertAll<TOutput>(Converter<T, TOutput> converter)

  // System.Collections.Generic.List.CopyTo (method)
  public void CopyTo(T[] array)
  public void CopyTo(int index, T[] array, int arrayIndex, int count)
  public void CopyTo(T[] array, int arrayIndex)

  // System.Collections.Generic.List.EnsureCapacity (method)
  public int EnsureCapacity(int capacity)

  // System.Collections.Generic.List.Exists (method)
  public bool Exists(Predicate<T> match)

  // System.Collections.Generic.List.Find (method)
  public T? Find(Predicate<T> match)

  // System.Collections.Generic.List.FindAll (method)
  public List<T> FindAll(Predicate<T> match)

  // System.Collections.Generic.List.FindIndex (method)
  public int FindIndex(Predicate<T> match)
  public int FindIndex(int startIndex, Predicate<T> match)
  public int FindIndex(int startIndex, int count, Predicate<T> match)

  // System.Collections.Generic.List.FindLast (method)
  public T? FindLast(Predicate<T> match)

  // System.Collections.Generic.List.FindLastIndex (method)
  public int FindLastIndex(Predicate<T> match)
  public int FindLastIndex(int startIndex, Predicate<T> match)
  public int FindLastIndex(int startIndex, int count, Predicate<T> match)

  // System.Collections.Generic.List.ForEach (method)
  public void ForEach(Action<T> action)

  // System.Collections.Generic.List.GetEnumerator (method)
  public List<T>.Enumerator GetEnumerator()

  // System.Collections.Generic.List.GetRange (method)
  public List<T> GetRange(int index, int count)

  // System.Collections.Generic.List.Slice (method)
  public List<T> Slice(int start, int length)

  // System.Collections.Generic.List.IndexOf (method)
  public int IndexOf(T item)
  public int IndexOf(T item, int index)
  public int IndexOf(T item, int index, int count)

  // System.Collections.Generic.List.Insert (method)
  public void Insert(int index, T item)

  // System.Collections.Generic.List.InsertRange (method)
  public void InsertRange(int index, IEnumerable<T> collection)

  // System.Collections.Generic.List.LastIndexOf (method)
  public int LastIndexOf(T item)
  public int LastIndexOf(T item, int index)
  public int LastIndexOf(T item, int index, int count)

  // System.Collections.Generic.List.Remove (method)
  public bool Remove(T item)

  // System.Collections.Generic.List.RemoveAll (method)
  public int RemoveAll(Predicate<T> match)

  // System.Collections.Generic.List.RemoveAt (method)
  public void RemoveAt(int index)

  // System.Collections.Generic.List.RemoveRange (method)
  public void RemoveRange(int index, int count)

  // System.Collections.Generic.List.Reverse (method)
  public void Reverse()
  public void Reverse(int index, int count)

  // System.Collections.Generic.List.Sort (method)
  public void Sort()
  public void Sort(IComparer<T>? comparer)
  public void Sort(int index, int count, IComparer<T>? comparer)
  public void Sort(Comparison<T> comparison)

  // System.Collections.Generic.List.ToArray (method)
  public T[] ToArray()

  // System.Collections.Generic.List.TrimExcess (method)
  public void TrimExcess()

  // System.Collections.Generic.List.TrueForAll (method)
  public bool TrueForAll(Predicate<T> match)
