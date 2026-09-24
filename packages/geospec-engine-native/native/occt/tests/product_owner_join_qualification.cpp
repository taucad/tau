// Focused qualification for the admission product and ordered owner joins.
// Compile with the pinned OCCT static closure, as for prototype_qualification.cpp.
#include "../bridge/geospec_occt_bridge.cpp"

#include <cassert>
#include <cstring>

int main() {
  const std::vector<ProductFacts> products = {
      {"0:1", "first"}, {"0:2", "second"}, {"0:1", "duplicate"}};
  const auto indices = index_products(products);
  assert(product_index(indices, "0:1") == 0);
  assert(product_index(indices, "0:2") == 1);
  try {
    (void)product_index(indices, "missing");
    assert(false && "missing product must fail");
  } catch (const Standard_Failure& failure) {
    assert(std::strcmp(failure.GetMessageString(),
                       "Occurrence product is absent from product facts.") == 0);
  }

  std::vector<OccurrenceFacts> occurrences(5);
  occurrences[0].product = 1;
  occurrences[1].product = 0;
  occurrences[2].product = 1;
  occurrences[3].product = 1;
  occurrences[4].product = 4;  // Outside the product sequence: no owner.
  const auto owners = index_product_owners(products.size(), occurrences);
  assert((owners[0] == std::vector<int>{1}));
  assert((owners[1] == std::vector<int>{0, 2, 3}));
  assert(owners[2].empty());
}
