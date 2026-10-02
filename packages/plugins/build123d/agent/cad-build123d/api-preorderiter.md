# build123d — preorderiter

1 top-level symbols. Signatures are verbatim python.

// Category: preorderiter
// Iterate over tree applying pre-order strategy starting at `node`
// Remarks: Start at root and go-down until reaching a leaf node.
Step upwards then, and search for the next leafs.

>>> from anytree import Node, RenderTree, AsciiStyle, PreOrderIter
>>> f = Node("f")
>>> b = Node("b", parent=f)
>>> a = Node("a", parent=b)
>>> d = Node("d", parent=b)
>>> c = Node("c", parent=d)
>>> e = Node("e", parent=d)
>>> g = Node("g", parent=f)
>>> i = Node("i", parent=g)
>>> h = Node("h", parent=i)
>>> print(RenderTree(f, style=AsciiStyle()).by_attr())
f
|-- b
|   |-- a
|   +-- d
|       |-- c
|       +-- e
+-- g
    +-- i
        +-- h
>>> [node.name for node in PreOrderIter(f)]
['f', 'b', 'a', 'd', 'c', 'e', 'g', 'i', 'h']
>>> [node.name for node in PreOrderIter(f, maxlevel=3)]
['f', 'b', 'a', 'd', 'g', 'i']
>>> [node.name for node in PreOrderIter(f, filter_=lambda n: n.name not in ('e', 'g'))]
['f', 'b', 'a', 'd', 'c', 'i', 'h']
>>> [node.name for node in PreOrderIter(f, stop=lambda n: n.name == 'd')]
['f', 'b', 'a', 'g', 'i', 'h']
PreOrderIter
