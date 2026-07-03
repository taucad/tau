OCCT_PREFIX ?= $(shell brew --prefix opencascade)
CXX ?= c++

CXXFLAGS ?= -std=c++20 -O3 -DNDEBUG
CXXFLAGS += -I$(OCCT_PREFIX)/include/opencascade
LDFLAGS += -L$(OCCT_PREFIX)/lib -Wl,-rpath,$(OCCT_PREFIX)/lib
LDLIBS += -lTKPrim -lTKBO -lTKBool -lTKBRep -lTKTopAlgo -lTKGeomAlgo -lTKGeomBase -lTKG3d -lTKG2d -lTKMesh -lTKMath -lTKernel

TARGET := v8-engine-brep-native

.PHONY: all clean run

all: $(TARGET)

$(TARGET): main.cpp
	$(CXX) $(CXXFLAGS) $(LDFLAGS) $< $(LDLIBS) -o $@

run: $(TARGET)
	./$(TARGET)

clean:
	rm -f $(TARGET)
