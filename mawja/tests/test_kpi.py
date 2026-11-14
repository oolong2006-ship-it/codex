import pytest

from sim.kpi import (FUEL_SAR_PER_L, VALUE_OF_TIME_SAR_PER_H, KpiAccumulator, cost_sar,
                     QUEUE_M_PER_HALTING_VEHICLE, PETROL_DENSITY_G_PER_L)

KEYS = {"delay_veh_h", "avg_wait_s", "max_queue_m", "throughput", "unfinished", "teleports",
        "fuel_l", "co2_kg", "cost_sar", "pending_insertion"}


def test_cost_constants():
    assert VALUE_OF_TIME_SAR_PER_H == 45.0
    assert FUEL_SAR_PER_L == 2.33


def test_cost_formula():
    # 100 delayed vehicle-hours * 45 + 200 L * 2.33
    assert cost_sar(delay_veh_h=100.0, fuel_l=200.0) == pytest.approx(4500.0 + 466.0)
    assert cost_sar(0.0, 0.0) == 0.0


def test_accumulator_avg_wait_is_pooled_vehicle_second_mean():
    acc = KpiAccumulator()
    acc.add_second(waits=[0.0, 10.0], halting=1, lane_halting=[2, 0], lane_length_m=[100.0, 100.0], fuel_mg=0.0, co2_mg=0.0)
    acc.add_second(waits=[], halting=0, lane_halting=[0], lane_length_m=[100.0], fuel_mg=0.0, co2_mg=0.0)  # skipped
    acc.add_second(waits=[30.0], halting=1, lane_halting=[4], lane_length_m=[100.0], fuel_mg=0.0, co2_mg=0.0)
    k = acc.finish(arrived=5, unfinished=1, teleports=0, pending_insertion=2)
    assert set(k) == KEYS
    # sum over vehicle-seconds / number of vehicle-seconds: (0 + 10 + 30) / 3
    assert k["avg_wait_s"] == pytest.approx(40.0 / 3)
    assert k["max_queue_m"] == pytest.approx(4 * QUEUE_M_PER_HALTING_VEHICLE)
    assert k["throughput"] == 5 and k["unfinished"] == 1 and k["teleports"] == 0
    assert k["pending_insertion"] == 2
    # two halting vehicle-seconds in total
    assert k["delay_veh_h"] == pytest.approx(2 / 3600)


def test_accumulator_fuel_co2_and_cost():
    acc = KpiAccumulator()
    for _ in range(3600):  # one vehicle halting for an hour
        acc.add_second(waits=[1.0], halting=1, lane_halting=[1], lane_length_m=[100.0],
                       fuel_mg=PETROL_DENSITY_G_PER_L * 1000 / 3600, co2_mg=1e6 / 3600)
    k = acc.finish(arrived=0, unfinished=1, teleports=0, pending_insertion=0)
    assert k["fuel_l"] == pytest.approx(1.0)
    assert k["co2_kg"] == pytest.approx(1.0)
    assert k["delay_veh_h"] == pytest.approx(1.0)
    assert k["cost_sar"] == pytest.approx(45.0 + 2.33)


def test_queue_capped_at_lane_length():
    acc = KpiAccumulator()
    # 81 halting vehicles * 7.5 m = 607.5 m, but the lane is only 606 m long
    acc.add_second(waits=[0.0], halting=81, lane_halting=[81, 3], lane_length_m=[606.0, 50.0],
                   fuel_mg=0.0, co2_mg=0.0)
    assert acc.finish(0, 0, 0, 0)["max_queue_m"] == pytest.approx(606.0)


def test_delay_counts_each_stopped_second_once_while_avg_wait_weights_long_waits():
    # One car stopped for 100 s next to one moving car: 100 stopped vehicle-seconds, but
    # the accumulated-wait mean grows with the square of the stop length.
    acc = KpiAccumulator()
    for t in range(1, 101):
        acc.add_second(waits=[float(t), 0.0], halting=1, lane_halting=[1], lane_length_m=[100.0],
                       fuel_mg=0.0, co2_mg=0.0)
    k = acc.finish(0, 2, 0, 0)
    assert k["delay_veh_h"] == pytest.approx(100 / 3600)
    assert k["avg_wait_s"] == pytest.approx(sum(range(1, 101)) / 200)
