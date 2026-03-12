def is_prime(n):
    """Check if a number is prime."""
    if n <= 1:
        return False
    if n <= 3:
        return True
    if n % 2 == 0 or n % 3 == 0:
        return False
    i = 5
    while i * i <= n:
        if n % i == 0 or n % (i + 2) == 0:
            return False
        i += 6
    return True

def sum_of_prime_open_doors(num_doors):
    """Calculate the sum of prime-numbered open doors after toggling."""
    # Step 1: Determine which doors are open
    open_doors = [i**2 for i in range(1, int(num_doors**0.5) + 1)]
    
    # Step 2: Filter open doors to find prime numbers
    prime_open_doors = [door for door in open_doors if is_prime(door)]
    
    # Step 3: Sum the prime-numbered open doors
    return sum(prime_open_doors)

# Number of doors
num_doors = 1000

# Calculate the sum of prime-numbered open doors
result = sum_of_prime_open_doors(num_doors)

# Print the result
print("The sum of prime-numbered open doors is:", result)